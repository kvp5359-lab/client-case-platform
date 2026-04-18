import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { findMissingField, findInvalidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { performRag } from "../_shared/knowledgeRag.ts";
import { isGeminiModel, callGeminiStream, geminiImagePart, geminiPdfPart, geminiTextPart, messagesToGeminiContents, parseGeminiStreamDelta, type GeminiPart, type GeminiContent } from "../_shared/gemini-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Content block for Anthropic Messages API (text, image, document) */
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_AI_MODEL = "claude-3-5-haiku-20241022";

const buildSystemPrompt = (context: string) => {
  const today = new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  return `Ты AI-ассистент проекта. Сегодняшняя дата: ${today}.
Тебе доступны данные проекта, выбранные пользователем (переписка, анкеты, документы).

${context}

---

Правила:
- Отвечай на вопросы пользователя, используя ТОЛЬКО информацию из данных выше
- Если информации нет — честно скажи об этом
- Отвечай на русском языке
- Используй Markdown для форматирования
- Будь конкретным — ссылайся на имена, даты, документы из контекста
- Не придумывай информацию, которой нет в данных`;
};

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse body — JSON или FormData (когда есть файл)
    let body: Record<string, unknown>;
    let uploadedFile: File | null = null;
    const contentType = req.headers.get("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      uploadedFile = formData.get("file") as File | null;
      const dataStr = formData.get("data") as string;
      if (!dataStr) {
        return new Response(
          JSON.stringify({ error: "Missing 'data' field in FormData" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        body = JSON.parse(dataStr);
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in 'data' field" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      // Z8-06: try-catch для невалидного JSON
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const missing = findMissingField(body, ["question", "workspace_id", "context"]);
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      question,
      workspace_id,
      context,
      conversation_history,
      // Knowledge base params (optional)
      knowledge_template_id,
      knowledge_all,
    } = body as {
      question: string;
      workspace_id: string;
      context: string;
      conversation_history?: Array<{ role: string; content: string }>;
      knowledge_template_id?: string;
      knowledge_all?: boolean;
    };

    // Limit context size to prevent excessive API costs
    const MAX_CONTEXT_LENGTH = 200_000;
    if (typeof context === "string" && context.length > MAX_CONTEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Context too long (max ${MAX_CONTEXT_LENGTH} characters)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const uuidFields = ["workspace_id"];
    if (knowledge_template_id) uuidFields.push("knowledge_template_id");
    const invalid = findInvalidUUID(body, uuidFields);
    if (invalid) {
      return new Response(
        JSON.stringify({ error: `Invalid UUID: ${invalid}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create clients
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check workspace membership
    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get workspace AI model first to determine provider
    const needsVoyage = !!knowledge_template_id || !!knowledge_all;
    const [workspaceResult, voyageResult] = await Promise.all([
      supabaseAdmin.from("workspaces").select("ai_model").eq("id", workspace_id).single(),
      needsVoyage
        ? supabaseAdmin.rpc("get_workspace_voyageai_api_key", { workspace_uuid: workspace_id })
        : Promise.resolve({ data: null }),
    ]);

    const aiModel = workspaceResult.data?.ai_model || DEFAULT_AI_MODEL;
    const useGemini = isGeminiModel(aiModel);

    // Get AI API key based on provider
    const rpcName = useGemini ? "get_workspace_google_api_key" : "get_workspace_api_key";
    const aiKeyResult = await supabaseAdmin.rpc(rpcName, { workspace_uuid: workspace_id });

    if (!aiKeyResult.data) {
      const providerName = useGemini ? "Google" : "Anthropic";
      return new Response(
        JSON.stringify({ error: `${providerName} API key not configured` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiApiKey = aiKeyResult.data as string;

    // ── Optional RAG: knowledge base search ──
    let knowledgeContext = "";
    let knowledgeSources: Array<{
      article_id: string | null;
      qa_id: string | null;
      article_title: string;
      similarity: number;
      source_type: string;
    }> = [];

    if (needsVoyage && voyageResult.data) {
      const voyageKey = voyageResult.data as string;

      try {
        const ragResult = await performRag(supabaseAdmin, {
          question,
          workspaceId: workspace_id,
          templateId: knowledge_template_id || undefined,
          voyageKey,
          conversationHistory: conversation_history,
        });

        if (ragResult) {
          knowledgeContext = `\n\n== БАЗА ЗНАНИЙ ==\n${ragResult.contextText}`;
          knowledgeSources = ragResult.sources;
        }
      } catch (ragErr) {
        console.error("RAG search failed (non-fatal):", ragErr);
        // Continue without knowledge context — project context is still available
      }
    }

    // Build system prompt with project context + optional knowledge context
    const fullContext = context + knowledgeContext;
    const systemPrompt = buildSystemPrompt(fullContext);

    // Build messages array (conversation_history + current question)
    const ALLOWED_ROLES = new Set(["user", "assistant"]);
    const messages: Array<{ role: string; content: string | ContentBlock[] }> = [];
    if (conversation_history && Array.isArray(conversation_history)) {
      const recent = conversation_history.slice(-20);
      for (const msg of recent) {
        if (ALLOWED_ROLES.has(msg.role) && typeof msg.content === "string") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Если есть файл — отправить как content block (document/image + text)
    // Also build Gemini contents in parallel if needed
    let geminiContents: GeminiContent[] = [];

    if (uploadedFile) {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const chunks: string[] = [];
      for (let i = 0; i < uint8.length; i += 4096) {
        chunks.push(String.fromCharCode(...uint8.subarray(i, i + 4096)));
      }
      const base64Data = btoa(chunks.join(""));
      const mimeType = uploadedFile.type || "application/octet-stream";
      const isPdf = mimeType === "application/pdf";

      if (useGemini) {
        // Gemini native: supports both images AND PDF via inlineData
        const filePart: GeminiPart = isPdf
          ? geminiPdfPart(base64Data)
          : mimeType.startsWith("image/")
            ? geminiImagePart(base64Data, mimeType)
            : geminiTextPart("[Неподдерживаемый тип файла]");

        messages.push({ role: "user", content: question }); // For logging
        // Build conversation history + current message with file
        const historyContents = messagesToGeminiContents(
          (conversation_history || []).slice(-20).filter(m => ["user", "assistant"].includes(m.role)),
        );
        geminiContents = [
          ...historyContents,
          { role: "user", parts: [filePart, geminiTextPart(question)] },
        ];
      } else {
        const contentBlocks: ContentBlock[] = [];
        if (isPdf) {
          contentBlocks.push({
            type: "document",
            source: { type: "base64", media_type: mimeType, data: base64Data },
          });
        } else if (mimeType.startsWith("image/")) {
          contentBlocks.push({
            type: "image",
            source: { type: "base64", media_type: mimeType, data: base64Data },
          });
        }
        contentBlocks.push({ type: "text", text: question });
        messages.push({ role: "user", content: contentBlocks });
      }

      console.log(
        `chat-with-messages: "${question.slice(0, 50)}..." context=${context.length} chars, kb=${knowledgeContext.length} chars, file=${uploadedFile.name} (${mimeType}), model=${aiModel}`,
      );
    } else {
      messages.push({ role: "user", content: question });

      console.log(
        `chat-with-messages: "${question.slice(0, 50)}..." context=${context.length} chars, kb=${knowledgeContext.length} chars, model=${aiModel}`,
      );
    }

    // Streaming SSE response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send knowledge sources event if we have them
          if (knowledgeSources.length > 0) {
            controller.enqueue(encoder.encode(
              `event: sources\ndata: ${JSON.stringify({ sources: knowledgeSources })}\n\n`,
            ));
          }

          if (useGemini) {
            // ── Gemini streaming (native SSE via streamGenerateContent) ──
            const contents: GeminiContent[] = geminiContents.length > 0
              ? geminiContents
              : [
                  ...messagesToGeminiContents(
                    (conversation_history || []).slice(-20).filter(m => ["user", "assistant"].includes(m.role)),
                  ),
                  { role: "user", parts: [geminiTextPart(question)] },
                ];

            let geminiResponse: Response;
            try {
              geminiResponse = await callGeminiStream({
                apiKey: aiApiKey,
                model: aiModel,
                contents,
                systemInstruction: systemPrompt,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : "Unknown error";
              console.error(`Gemini stream error: ${errMsg}`);
              controller.enqueue(encoder.encode(
                `event: error\ndata: ${JSON.stringify({ error: `AI error: ${errMsg}` })}\n\n`,
              ));
              controller.close();
              return;
            }

            // Read Gemini native SSE stream
            const reader = geminiResponse.body!.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop()!;

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const delta = parseGeminiStreamDelta(line.slice(6));
                if (delta) {
                  fullText += delta;
                  controller.enqueue(encoder.encode(
                    `event: text\ndata: ${JSON.stringify(delta)}\n\n`,
                  ));
                }
              }
            }

            controller.enqueue(encoder.encode(
              `event: done\ndata: ${JSON.stringify({ answer: fullText })}\n\n`,
            ));
            controller.close();
          } else {
            // ── Claude streaming (original) ──
            const claudeResponse = await fetch(ANTHROPIC_API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": aiApiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: aiModel,
                max_tokens: 4096,
                system: systemPrompt,
                messages,
                stream: true,
              }),
            });

            if (!claudeResponse.ok) {
              const errText = await claudeResponse.text();
              console.error(`Anthropic stream error (${claudeResponse.status}): ${errText}`);
              controller.enqueue(encoder.encode(
                `event: error\ndata: ${JSON.stringify({ error: `AI error: ${claudeResponse.status}` })}\n\n`,
              ));
              controller.close();
              return;
            }

            // Read Claude SSE stream and forward text chunks
            const reader = claudeResponse.body!.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop()!;

              for (const line of lines) {
                if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
                try {
                  const parsed = JSON.parse(line.slice(6));
                  if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                    const text = parsed.delta.text;
                    fullText += text;
                    controller.enqueue(encoder.encode(
                      `event: text\ndata: ${JSON.stringify(text)}\n\n`,
                    ));
                  }
                } catch {
                  // Skip malformed JSON lines
                }
              }
            }

            controller.enqueue(encoder.encode(
              `event: done\ndata: ${JSON.stringify({ answer: fullText })}\n\n`,
            ));
            controller.close();
          }
        } catch (err) {
          console.error("chat-with-messages stream error:", err);
          try {
            controller.enqueue(encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: "Chat failed" })}\n\n`,
            ));
            controller.close();
          } catch {
            // Controller may already be closed
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("chat-with-messages error:", err);
    return new Response(
      JSON.stringify({ error: "Chat failed" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});
