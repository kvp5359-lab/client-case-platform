import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { extractText, getDocumentProxy } from "npm:unpdf";
import { isGeminiModel, callGeminiApi, geminiImagePart, geminiPdfPart, geminiTextPart } from "../_shared/gemini-client.ts";

/**
 * Edge Function: extract-text
 *
 * Фоновое извлечение текста из PDF/изображений.
 * Приоритет: 1) unpdf для PDF с текстовым слоем (бесплатно)
 *            2) Google Vision OCR для сканов/картинок (дёшево)
 *            3) Claude Haiku Vision как последний fallback
 * Результат сохраняется в documents.text_content для кэширования.
 *
 * Идемпотентна: если text_content уже заполнен — ничего не делает.
 * При любой ошибке — тихо логирует и возвращает 200.
 */

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
// Минимум символов на страницу, чтобы считать PDF текстовым (не сканом)
const MIN_CHARS_PER_PAGE = 50;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    // Внутренний вызов (например, от Telegram-бота) — без пользовательского JWT,
    // авторизуется через x-internal-secret (тот же механизм, что в telegram-send-message)
    const internalSecret = req.headers.get("x-internal-secret");
    const expectedInternalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const isInternalCall = !!internalSecret && !!expectedInternalSecret && internalSecret === expectedInternalSecret;

    if (!authHeader && !isInternalCall) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { document_id } = await req.json() as { document_id: string };
    if (!document_id || !isValidUUID(document_id)) {
      return new Response(
        JSON.stringify({ error: "document_id must be a valid UUID" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Service role client — для записи и доступа к vault
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // User client — для проверки доступа через RLS. При внутреннем вызове
    // используем service-role, тк userа нет, а проверки membership мы пропускаем.
    const supabase = isInternalCall
      ? supabaseServiceRole
      : createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader! } },
        });

    // Verify user (пропускаем для внутренних вызовов)
    let userId: string | null = null;
    if (!isInternalCall) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      userId = user.id;
    }

    // Получаем документ (через user client для проверки доступа)
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, workspace_id, text_content")
      .eq("id", document_id)
      .single();

    if (docError || !document) {
      console.log(`[EXTRACT-TEXT] Document not found: ${document_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "document_not_found" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Verify workspace membership (пропускаем для внутренних вызовов)
    if (!isInternalCall && userId) {
      const isMember = await checkWorkspaceMembership(supabaseServiceRole, userId, document.workspace_id);
      if (!isMember) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    // Идемпотентность: если текст уже извлечён — пропускаем
    if (document.text_content) {
      console.log(`[EXTRACT-TEXT] Already has text_content, skipping: ${document_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "already_extracted" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Получаем файл документа
    const { data: fileData, error: fileError } = await supabase
      .from("document_files")
      .select("file_path, file_name, mime_type, file_id")
      .eq("document_id", document_id)
      .eq("is_current", true)
      .single();

    if (fileError || !fileData) {
      console.log(`[EXTRACT-TEXT] No file found for document: ${document_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_file" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const mimeType = fileData.mime_type;
    const isPdf = mimeType === "application/pdf";
    const isImage = mimeType.startsWith("image/");

    if (!isPdf && !isImage) {
      console.log(`[EXTRACT-TEXT] Unsupported mime type: ${mimeType}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "unsupported_type" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Get workspace AI model to determine provider
    const { data: wsData } = await supabaseServiceRole
      .from("workspaces")
      .select("ai_model")
      .eq("id", document.workspace_id)
      .single();

    const wsModel = wsData?.ai_model || "claude-haiku-4-5-20251001";
    const useGemini = isGeminiModel(wsModel);

    // Получаем API ключ из vault
    const rpcName = useGemini ? "get_workspace_google_api_key" : "get_workspace_api_key";
    const { data: apiKeyResult, error: apiKeyError } = await supabaseServiceRole
      .rpc(rpcName, { workspace_uuid: document.workspace_id });

    if (apiKeyError || !apiKeyResult) {
      const providerName = useGemini ? "Google" : "Anthropic";
      console.log(`[EXTRACT-TEXT] No ${providerName} API key for workspace: ${document.workspace_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_api_key" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const aiApiKey = apiKeyResult as string;

    // Determine storage bucket and path: use files table if file_id exists, fallback to document-files
    let storageBucket = "document-files";
    let storagePath = fileData.file_path;

    if (fileData.file_id) {
      const { data: fileRecord } = await supabaseServiceRole
        .from("files")
        .select("bucket, storage_path")
        .eq("id", fileData.file_id)
        .single();

      if (fileRecord?.bucket && fileRecord?.storage_path) {
        storageBucket = fileRecord.bucket;
        storagePath = fileRecord.storage_path;
        console.log(`[EXTRACT-TEXT] Using files table: bucket=${storageBucket}`);
      }
    }

    // Создаём signed URL для файла
    const t_start = performance.now();
    const { data: signedData, error: signedError } = await supabaseServiceRole.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, 300);

    if (signedError || !signedData?.signedUrl) {
      console.error("[EXTRACT-TEXT] Failed to create signed URL:", signedError);
      return new Response(
        JSON.stringify({ skipped: true, reason: "signed_url_failed" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    console.log(`[EXTRACT-TEXT] Signed URL created in ${(performance.now() - t_start).toFixed(0)}ms`);

    let extractedText = "";
    let extractionMethod = "";
    let gvDebug = ""; // Временно: для отладки Google Vision
    let pdfTotalPages = 0; // Кол-во страниц PDF (определяется через unpdf)

    // Для PDF — сначала пробуем извлечь текст без AI (бесплатно)
    if (isPdf) {
      try {
        const t_pdf = performance.now();
        const pdfResponse = await fetch(signedData.signedUrl);
        if (pdfResponse.ok) {
          const pdfBuffer = new Uint8Array(await pdfResponse.arrayBuffer());
          const pdf = await getDocumentProxy(pdfBuffer);
          const { totalPages, text } = await extractText(pdf, { mergePages: true });
          pdfTotalPages = totalPages;
          const pdfText = (text as string).trim();
          const avgCharsPerPage = pdfText.length / Math.max(totalPages, 1);
          const pdfMs = Math.round(performance.now() - t_pdf);

          console.log(`[EXTRACT-TEXT] unpdf: ${pdfText.length} chars, ${totalPages} pages, avg ${Math.round(avgCharsPerPage)} chars/page in ${pdfMs}ms`);

          if (avgCharsPerPage >= MIN_CHARS_PER_PAGE && pdfText.length > 0) {
            extractedText = pdfText;
            extractionMethod = "unpdf";
            console.log(`[EXTRACT-TEXT] Text layer found — using unpdf (free)`);
          } else {
            console.log(`[EXTRACT-TEXT] No text layer (scan) — falling back to Google Vision`);
          }
        }
      } catch (pdfError) {
        console.log(`[EXTRACT-TEXT] unpdf failed, falling back to Google Vision:`, pdfError);
      }
    }

    // Если текст не извлечён (скан или картинка) — Google Vision OCR
    if (!extractedText) {
      const googleVisionApiKey = Deno.env.get("GOOGLE_VISION_API_KEY");

      if (googleVisionApiKey) {
        try {
          const t_gv = performance.now();

          // Скачиваем файл и конвертируем в base64
          const fileResponse = await fetch(signedData.signedUrl);
          if (!fileResponse.ok) throw new Error(`Failed to download file: ${fileResponse.status}`);
          const fileBuffer = new Uint8Array(await fileResponse.arrayBuffer());
          const CHUNK = 0x8000;
          const b64parts: string[] = [];
          for (let i = 0; i < fileBuffer.length; i += CHUNK) {
            b64parts.push(String.fromCharCode(...fileBuffer.subarray(i, i + CHUNK)));
          }
          const base64Content = btoa(b64parts.join(""));

          console.log(`[EXTRACT-TEXT] GV: ${fileBuffer.length} bytes (${(fileBuffer.length / 1024).toFixed(0)}KB), mime=${mimeType}, isPdf=${isPdf}`);

          let gvText = "";

          if (isPdf) {
            // PDF → files:annotate: лимит 5 страниц за запрос.
            // Если страниц больше — шлём несколько запросов и склеиваем результат.
            const GV_PAGE_LIMIT = 5;
            const totalPages = pdfTotalPages || GV_PAGE_LIMIT; // fallback если unpdf не отработал
            const allPageTexts: string[] = [];

            for (let startPage = 1; startPage <= totalPages; startPage += GV_PAGE_LIMIT) {
              const endPage = Math.min(startPage + GV_PAGE_LIMIT - 1, totalPages);
              const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

              console.log(`[EXTRACT-TEXT] GV chunk: pages ${startPage}–${endPage}`);

              const gvResp = await fetch(
                `https://vision.googleapis.com/v1/files:annotate?key=${googleVisionApiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    requests: [{
                      inputConfig: { content: base64Content, mimeType: "application/pdf" },
                      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                      pages,
                    }],
                  }),
                }
              );

              if (gvResp.ok) {
                const gvResult = await gvResp.json();
                const pageResponses = gvResult.responses?.[0]?.responses || [];
                for (const pageResp of pageResponses) {
                  const pageText = pageResp?.fullTextAnnotation?.text || "";
                  if (pageText) allPageTexts.push(pageText);
                }
                console.log(`[EXTRACT-TEXT] GV chunk pages ${startPage}–${endPage}: ${pageResponses.length} pages returned`);

                // Если Vision вернул меньше страниц чем запросили — PDF закончился раньше
                if (pageResponses.length < pages.length) {
                  console.log(`[EXTRACT-TEXT] GV: PDF has fewer pages than expected, stopping`);
                  break;
                }
              } else {
                const gvErrorBody = await gvResp.text();
                gvDebug = `http_${gvResp.status}: ${gvErrorBody.substring(0, 200)}`;
                console.error(`[EXTRACT-TEXT] GV files:annotate HTTP ${gvResp.status}: ${gvErrorBody.substring(0, 300)}`);
                break;
              }
            }

            gvText = allPageTexts.join("\n").trim();
            console.log(`[EXTRACT-TEXT] GV files:annotate total: ${allPageTexts.length} pages, ${gvText.length} chars`);
          } else {
            // Картинка → images:annotate
            const gvResp = await fetch(
              `https://vision.googleapis.com/v1/images:annotate?key=${googleVisionApiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  requests: [{
                    image: { content: base64Content },
                    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                  }],
                }),
              }
            );

            if (gvResp.ok) {
              const gvResult = await gvResp.json();
              const responseError = gvResult.responses?.[0]?.error;
              if (responseError) {
                gvDebug = `resp_err: ${responseError.code} ${responseError.message}`;
              }
              gvText = gvResult.responses?.[0]?.fullTextAnnotation?.text?.trim() || "";
            } else {
              const gvErrorBody = await gvResp.text();
              gvDebug = `http_${gvResp.status}: ${gvErrorBody.substring(0, 200)}`;
              console.error(`[EXTRACT-TEXT] GV images:annotate HTTP ${gvResp.status}: ${gvErrorBody.substring(0, 300)}`);
            }
          }

          const gvMs = Math.round(performance.now() - t_gv);
          if (gvText.length > 0) {
            extractedText = gvText;
            extractionMethod = "google-vision";
            console.log(`[EXTRACT-TEXT] Google Vision: ${gvText.length} chars in ${gvMs}ms`);
          } else {
            if (!gvDebug) gvDebug = `empty_text_${gvMs}ms`;
            console.log(`[EXTRACT-TEXT] Google Vision: no text in ${gvMs}ms`);
          }
        } catch (gvError) {
          gvDebug = `exception: ${gvError}`;
          console.error(`[EXTRACT-TEXT] Google Vision exception:`, gvError);
        }
      }
    }

    // Последний fallback — AI Vision (Claude or Gemini)
    if (!extractedText) {
      const t_api = performance.now();

      if (useGemini) {
        // Gemini Vision fallback (supports both images and PDF via native API)
        const { data: fileBlob, error: dlError } = await supabaseServiceRole.storage
          .from(storageBucket)
          .download(storagePath);

        if (dlError || !fileBlob) {
          console.error("[EXTRACT-TEXT] Failed to download file for Gemini:", dlError);
          return new Response(
            JSON.stringify({ skipped: true, reason: "download_error" }),
            { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }

        const buf = await fileBlob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const CHUNK = 4096;
        const b64parts: string[] = [];
        for (let i = 0; i < bytes.length; i += CHUNK) {
          b64parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[]));
        }
        const b64 = btoa(b64parts.join(""));

        const filePart = isPdf ? geminiPdfPart(b64) : geminiImagePart(b64, mimeType);

        try {
          extractedText = await callGeminiApi({
            apiKey: aiApiKey,
            model: wsModel,
            contents: [{
              role: "user",
              parts: [
                filePart,
                geminiTextPart("Извлеки весь текст из документа. Верни только текст документа, без комментариев."),
              ],
            }],
            thinkingBudget: 0,
          });
          extractionMethod = "gemini-vision";
          const apiMs = Math.round(performance.now() - t_api);
          console.log(`[EXTRACT-TEXT] Gemini Vision fallback: ${extractedText.length} chars in ${apiMs}ms`);
        } catch (err) {
          console.error("[EXTRACT-TEXT] Gemini Vision error:", err);
          return new Response(
            JSON.stringify({ skipped: true, reason: "api_error" }),
            { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }
      } else {
        // Claude Vision fallback (original)
        type ClaudeContentBlock = { type: string; text?: string; source?: { type: string; media_type?: string; data?: string; url?: string } };
        const fileContent: ClaudeContentBlock = isPdf
          ? { type: "document", source: { type: "url", url: signedData.signedUrl } }
          : { type: "image", source: { type: "url", url: signedData.signedUrl } };

        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": aiApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: EXTRACTION_MODEL,
            max_tokens: 8192,
            messages: [{
              role: "user",
              content: [
                fileContent,
                { type: "text", text: "Извлеки весь текст из документа. Верни только текст документа, без комментариев." },
              ],
            }],
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error(`[EXTRACT-TEXT] Claude API error ${resp.status}: ${errorText}`);
          return new Response(
            JSON.stringify({ skipped: true, reason: "api_error" }),
            { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
          );
        }

        const result = await resp.json();
        extractedText = result.content[0]?.text || "";
        extractionMethod = "claude-vision";
        const apiMs = Math.round(performance.now() - t_api);
        console.log(`[EXTRACT-TEXT] Claude Vision fallback: ${extractedText.length} chars in ${apiMs}ms (${EXTRACTION_MODEL})`);
      }
    }

    if (!extractedText) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "empty_text" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Сохраняем text_content через service role
    const { error: updateError } = await supabaseServiceRole
      .from("documents")
      .update({ text_content: extractedText })
      .eq("id", document_id);

    if (updateError) {
      console.error("[EXTRACT-TEXT] Failed to save text_content:", updateError);
      return new Response(
        JSON.stringify({ skipped: true, reason: "save_failed" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const totalMs = Math.round(performance.now() - t_start);
    console.log(`[EXTRACT-TEXT] Done: ${document_id} — ${extractedText.length} chars, method=${extractionMethod}, ${totalMs}ms total`);

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        text_length: extractedText.length,
        method: extractionMethod,
        timing: { total_ms: totalMs },
        // Z8-01: gv_debug убран из ответа клиенту — только в серверных логах
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[EXTRACT-TEXT] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
