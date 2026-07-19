import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveFileLocation } from "../_shared/storageHelpers.ts";
import { isGeminiModel, callGeminiApi, geminiImagePart, geminiPdfPart, geminiTextPart } from "../_shared/gemini-client.ts";
import { logAiUsage, anthropicUsage } from "../_shared/logAiUsage.ts";
import { storageCreateSignedUrl, storageDownload } from "../_shared/storage.ts";

interface CheckDocumentRequest {
  document_id: string;
}

interface DocumentData {
  id: string;
  name: string;
  workspace_id: string;
  folder_id: string | null;
  text_content: string | null;
}

interface FolderData {
  ai_naming_prompt: string | null;
  ai_check_prompt: string | null;
}

interface SlotData {
  ai_naming_prompt: string | null;
  ai_check_prompt: string | null;
  // Embed справочника: унаследованные промпты шаблона слота (PostgREST → объект или null).
  slot_template: { ai_naming_prompt: string | null; ai_check_prompt: string | null } | null;
}

interface WorkspaceData {
  ai_model: string | null;
  default_ai_naming_prompt: string | null;
  default_ai_check_prompt: string | null;
}

interface DocumentFileData {
  file_path: string;
  file_name: string;
  mime_type: string;
  file_id: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req) });
  }

  try {
    const t_total = performance.now();

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { document_id } = await req.json() as CheckDocumentRequest;
    if (!document_id) {
      return new Response(
        JSON.stringify({ error: "document_id is required" }),
        { status: 400, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    if (!isValidUUID(document_id)) {
      return new Response(
        JSON.stringify({ error: "document_id must be a valid UUID" }),
        { status: 400, headers: corsHeadersFor(req) }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User client — for reads (respects RLS, verifies user has access)
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service role client — for writes and vault access (bypasses RLS)
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    // Get document data (including text_content) — via user client to verify access
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, name, workspace_id, folder_id, text_content")
      .eq("id", document_id)
      .single<DocumentData>();

    if (docError || !document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    // Verify workspace membership
    const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, document.workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    // Получаем AI-промпты по иерархии: слот → шаблон слота (справочник) → папка → дефолт воркспейса.
    // Уровень слота: документ привязан к folder_slot через folder_slots.document_id.
    let aiNamingPrompt: string | null = null;
    let aiCheckPrompt: string | null = null;

    const { data: slot } = await supabase
      .from("folder_slots")
      .select("ai_naming_prompt, ai_check_prompt, slot_template:slot_templates(ai_naming_prompt, ai_check_prompt)")
      .eq("document_id", document_id)
      .limit(1)
      .maybeSingle<SlotData>();

    if (slot) {
      // Эффективный промпт: локальный слота ?? унаследованный из справочника.
      aiNamingPrompt = slot.ai_naming_prompt || slot.slot_template?.ai_naming_prompt || null;
      aiCheckPrompt = slot.ai_check_prompt || slot.slot_template?.ai_check_prompt || null;
    }

    // Уровень папки: добиваем недостающие промпты с папки.
    if ((!aiNamingPrompt || !aiCheckPrompt) && document.folder_id) {
      const { data: folder } = await supabase
        .from("folders")
        .select("ai_naming_prompt, ai_check_prompt")
        .eq("id", document.folder_id)
        .single<FolderData>();

      if (folder) {
        if (!aiNamingPrompt) aiNamingPrompt = folder.ai_naming_prompt || null;
        if (!aiCheckPrompt) aiCheckPrompt = folder.ai_check_prompt || null;
      }
    }

    // Воркспейс: настройки модели + дефолтные промпты как последний фолбэк.
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("ai_model, default_ai_naming_prompt, default_ai_check_prompt")
      .eq("id", document.workspace_id)
      .single<WorkspaceData>();

    if (!aiNamingPrompt && workspace?.default_ai_naming_prompt) {
      aiNamingPrompt = workspace.default_ai_naming_prompt;
    }
    if (!aiCheckPrompt && workspace?.default_ai_check_prompt) {
      aiCheckPrompt = workspace.default_ai_check_prompt;
    }

    const hasAiPrompts = !!(aiNamingPrompt || aiCheckPrompt);

    // If no prompts AND text already extracted — nothing to do
    if (!hasAiPrompts && document.text_content) {
      return new Response(
        JSON.stringify({
          success: true,
          suggested_names: [],
          check_result: "",
          checked_at: new Date().toISOString(),
          text_content: document.text_content,
        }),
        { status: 200, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    const aiModel = workspace?.ai_model || "claude-haiku-4-5-20251001";
    const useGemini = isGeminiModel(aiModel);
    // Fast model for text extraction (Step 1)
    // For Claude: Haiku is 3-5x faster for OCR tasks
    // For Gemini: use the selected model (Flash is already fast)
    const extractionModel = useGemini ? aiModel : "claude-haiku-4-5-20251001";

    // Get API key from vault using service role
    const rpcName = useGemini ? "get_workspace_google_api_key" : "get_workspace_api_key";
    const { data: apiKeyResult, error: apiKeyError } = await supabaseServiceRole
      .rpc(rpcName, { workspace_uuid: document.workspace_id });

    if (apiKeyError || !apiKeyResult) {
      const providerName = useGemini ? "Google" : "Anthropic";
      return new Response(
        JSON.stringify({ error: `${providerName} API key not configured for this workspace` }),
        { status: 400, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
      );
    }

    const apiKey = apiKeyResult as string;

    // ── Helper: call AI API (Claude or Gemini) ──
    type ClaudeContentBlock = { type: string; text?: string; source?: { type: string; media_type?: string; data?: string; url?: string } };

    /** Helper to download a URL and return base64 + mimeType */
    async function downloadToBase64(fileUrl: string): Promise<{ b64: string; mime: string }> {
      const resp = await fetch(fileUrl);
      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const CHUNK = 4096;
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += CHUNK) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[]));
      }
      return { b64: btoa(chunks.join("")), mime: resp.headers.get("content-type") || "application/octet-stream" };
    }

    async function callAI(content: ClaudeContentBlock[], model: string, maxTokens: number): Promise<string> {
      if (isGeminiModel(model)) {
        // Convert Claude content blocks to Gemini native parts
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        for (const block of content) {
          if (block.type === "text" && block.text) {
            parts.push(geminiTextPart(block.text));
          } else if (block.type === "image" && block.source) {
            if (block.source.type === "base64" && block.source.data && block.source.media_type) {
              parts.push(geminiImagePart(block.source.data, block.source.media_type));
            } else if (block.source.type === "url" && block.source.url) {
              const { b64, mime } = await downloadToBase64(block.source.url);
              parts.push(geminiImagePart(b64, mime));
            }
          } else if (block.type === "document" && block.source) {
            // PDF via URL — download and send as inlineData (native Gemini API supports PDF!)
            if (block.source.type === "url" && block.source.url) {
              const { b64 } = await downloadToBase64(block.source.url);
              parts.push(geminiPdfPart(b64));
            } else if (block.source.type === "base64" && block.source.data) {
              parts.push(geminiPdfPart(block.source.data));
            }
          }
        }

        if (parts.length === 0) {
          return "";
        }

        return await callGeminiApi({
          apiKey,
          model,
          contents: [{ role: "user", parts }],
          onUsage: (u) => logAiUsage({
            workspaceId: document.workspace_id, functionName: "check-document",
            provider: "google", model, userId: user.id, feature: "document-check",
            inputTokens: u.inputTokens, outputTokens: u.outputTokens,
          }),
        });
      }

      // Claude path (original)
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content }],
        }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`Claude API error ${resp.status}:`, errorText);
        throw new Error(`Claude API error (${resp.status})`);
      }

      const result = await resp.json();
      const _u = anthropicUsage(result);
      await logAiUsage({
        workspaceId: document.workspace_id, functionName: "check-document",
        provider: "anthropic", model, userId: user.id, feature: "document-check",
        inputTokens: _u.inputTokens, outputTokens: _u.outputTokens,
      });
      return result.content[0]?.text || "";
    }

    // Determine if we have cached text or need to process file
    let documentTextContent = document.text_content;
    let documentFiles: DocumentFileData | null = null;

    // Get file info
    const { data: files } = await supabase
      .from("document_files")
      .select("file_path, file_name, mime_type, file_id")
      .eq("document_id", document_id)
      .eq("is_current", true)
      .single<DocumentFileData>();

    documentFiles = files || null;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Extract text from file (if not cached)
    // ═══════════════════════════════════════════════════════════════
    if (!documentTextContent && documentFiles) {
      const mimeType = documentFiles.mime_type;
      const isPdf = mimeType === "application/pdf";
      const isImage = mimeType.startsWith("image/");

      if (isPdf || isImage) {
        console.log(`[CHECK-DOCUMENT] Step 1: Extracting text from ${mimeType}`);
        const t1 = performance.now();

        // Determine storage bucket and path: use files table if file_id exists
        const { bucket: storageBucket, storagePath } = await resolveFileLocation(
          supabaseServiceRole, documentFiles.file_path, documentFiles.file_id,
        );
        if (documentFiles.file_id) {
          console.log(`[CHECK-DOCUMENT] Using files table: bucket=${storageBucket}`);
        }

        if (useGemini) {
          // For Gemini: download file and send as inlineData (supports both images and PDF)
          const { data: fileData, error: fileError } = await storageDownload(supabaseServiceRole, storageBucket, storagePath);

          if (fileError || !fileData) {
            console.error("[CHECK-DOCUMENT] Failed to download file:", fileError);
            documentTextContent = "";
          } else {
            const arrayBuffer = await fileData.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const CHUNK = 4096;
            const b64parts: string[] = [];
            for (let i = 0; i < bytes.length; i += CHUNK) {
              b64parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[]));
            }
            const b64 = btoa(b64parts.join(""));

            // Use appropriate part type: PDF or image
            const filePart = isPdf ? geminiPdfPart(b64) : geminiImagePart(b64, mimeType);

            try {
              const t_api1 = performance.now();
              documentTextContent = await callGeminiApi({
                apiKey,
                model: extractionModel,
                contents: [
                  {
                    role: "user",
                    parts: [
                      filePart,
                      geminiTextPart("Извлеки весь текст из документа. Верни только текст документа, без комментариев."),
                    ],
                  },
                ],
                thinkingBudget: 0,
                onUsage: (u) => logAiUsage({
                  workspaceId: document.workspace_id, functionName: "check-document",
                  provider: "google", model: extractionModel, userId: user.id, feature: "text-extraction",
                  inputTokens: u.inputTokens, outputTokens: u.outputTokens,
                }),
              });
              console.log(`[CHECK-DOCUMENT] Step 1 done: ${documentTextContent.length} chars in ${(performance.now() - t_api1).toFixed(0)}ms`);
            } catch (err) {
              console.error("[CHECK-DOCUMENT] Text extraction failed:", err);
              documentTextContent = "";
            }
          }
        } else {
          // Claude path: use signed URL
          const { data: signedData, error: signedError } = await storageCreateSignedUrl(supabaseServiceRole, storageBucket, storagePath, 300); // 5 minutes

          if (signedError || !signedData?.signedUrl) {
            console.error("[CHECK-DOCUMENT] Failed to create signed URL:", signedError);
            documentTextContent = "";
          } else {
            console.log(`[CHECK-DOCUMENT] Signed URL created in ${(performance.now() - t1).toFixed(0)}ms`);

            const fileContent: ClaudeContentBlock = isPdf
              ? { type: "document", source: { type: "url", url: signedData.signedUrl } }
              : { type: "image", source: { type: "url", url: signedData.signedUrl } };

            try {
              const t_api1 = performance.now();
              documentTextContent = await callAI(
                [
                  fileContent,
                  { type: "text", text: "Извлеки весь текст из документа. Верни только текст документа, без комментариев." },
                ],
                extractionModel,
                8192,
              );
              console.log(`[CHECK-DOCUMENT] Step 1 done: ${documentTextContent.length} chars in ${(performance.now() - t_api1).toFixed(0)}ms`);
            } catch (err) {
              console.error("[CHECK-DOCUMENT] Text extraction failed:", err);
              documentTextContent = "";
            }
          }
        }
      } else {
        console.log(`[CHECK-DOCUMENT] Unsupported file type: ${mimeType}`);
        documentTextContent = "";
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Naming + Check (separate calls for isolation)
    // ═══════════════════════════════════════════════════════════════
    const fileName = documentFiles?.file_name || "неизвестно";
    const docContext = `\nТекущее название документа: ${document.name}\nИмя файла: ${fileName}`;

    let suggestedNames: string[] = [];
    let aiCheckResult = "";

    if (documentTextContent) {
      const promises: Promise<void>[] = [];

      // --- Naming call (isolated) ---
      if (aiNamingPrompt) {
        promises.push((async () => {
          const namingPrompt = `${aiNamingPrompt}\n\nКаждое название на отдельной строке. Кроме названий не выводи ничего.\n${docContext}`;

          console.log("[CHECK-DOCUMENT] Step 2a: Naming");
          const t2a = performance.now();

          const namingResponse = await callAI(
            [
              { type: "text", text: documentTextContent! },
              { type: "text", text: namingPrompt },
            ],
            aiModel,
            1024,
          );

          console.log(`[CHECK-DOCUMENT] Step 2a done: ${namingResponse.length} chars in ${(performance.now() - t2a).toFixed(0)}ms`);

          suggestedNames = namingResponse
            .split("\n")
            .map((name: string) => name.trim())
            .filter((name: string) => name.length > 0 && name.length < 200 && !name.startsWith("#"));

          console.log("[CHECK-DOCUMENT] Suggested names:", suggestedNames.length);
        })());
      }

      // --- Check call (isolated) ---
      if (aiCheckPrompt) {
        promises.push((async () => {
          const checkPrompt = `${aiCheckPrompt}\n${docContext}`;

          console.log("[CHECK-DOCUMENT] Step 2b: Check");
          const t2b = performance.now();

          const checkResponse = await callAI(
            [
              { type: "text", text: documentTextContent! },
              { type: "text", text: checkPrompt },
            ],
            aiModel,
            2048,
          );

          console.log(`[CHECK-DOCUMENT] Step 2b done: ${checkResponse.length} chars in ${(performance.now() - t2b).toFixed(0)}ms`);

          aiCheckResult = checkResponse.trim();
          console.log("[CHECK-DOCUMENT] Check result length:", aiCheckResult.length);
        })());
      }

      // Run both calls in parallel
      await Promise.all(promises);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Save results using SERVICE ROLE client
    // ═══════════════════════════════════════════════════════════════
    const t_save = performance.now();
    const updateData: { ai_check_result?: string | null; ai_checked_at: string; text_content?: string | null } = {
      ai_check_result: aiCheckResult || null,
      ai_checked_at: new Date().toISOString(),
    };

    // Save extracted text for future reuse (cache)
    if (!document.text_content && documentTextContent) {
      updateData.text_content = documentTextContent;
      console.log(`[CHECK-DOCUMENT] Caching text_content: ${documentTextContent.length} chars`);
    }

    const { error: updateError } = await supabaseServiceRole
      .from("documents")
      .update(updateData)
      .eq("id", document_id);

    if (updateError) {
      console.error("[CHECK-DOCUMENT] Failed to save:", updateError);
    } else {
      console.log(`[CHECK-DOCUMENT] DB save: ${(performance.now() - t_save).toFixed(0)}ms`);
    }

    console.log(`[CHECK-DOCUMENT] TOTAL: ${(performance.now() - t_total).toFixed(0)}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        suggested_names: suggestedNames,
        check_result: aiCheckResult,
        checked_at: new Date().toISOString(),
        text_content: updateData.text_content,
      }),
      { status: 200, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } }
    );
  }
});
