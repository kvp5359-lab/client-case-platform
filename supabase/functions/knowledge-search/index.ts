import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { findMissingField, findInvalidUUID } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import {
  selectSourcesWithAI,
  resolveTemplateArticleIds,
  performRag,
  parseUsedSources,
  type SourceCandidate,
} from "../_shared/knowledgeRag.ts";
import { isGeminiModel, callGeminiApi, callGeminiStream, messagesToGeminiContents, geminiTextPart, parseGeminiStreamDelta } from "../_shared/gemini-client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_AI_MODEL = "claude-3-5-haiku-20241022";

// ── Knowledge base system prompt ──

function buildKnowledgeSystemPrompt(context: string): string {
  return `Ты AI-ассистент базы знаний. Отвечай на вопросы пользователя, используя ТОЛЬКО предоставленный контекст из статей.

Контекст из базы знаний:

${context}

ВАЖНО — УТОЧНЕНИЕ ПРИ НЕОДНОЗНАЧНОСТИ:

Перед ответом проанализируй найденные источники. Если они содержат информацию по РАЗНЫМ темам, категориям или видам (например, списки документов для разных типов ВНЖ, процедуры для разных стран, требования для разных случаев) — НЕ смешивай их в один ответ. Вместо этого:

1. Кратко скажи, что нашёл информацию по нескольким вариантам
2. Перечисли варианты нумерованным списком (с указанием источника/статьи)
3. Спроси пользователя, по какому именно варианту нужен ответ
4. БОЛЬШЕ НИЧЕГО НЕ ПИШИ — никаких подробностей, никаких цитат. Только список вариантов и вопрос.

Когда НЕ нужно уточнять:
- Если все источники про одну тему — отвечай сразу
- Если пользователь уже уточнил тему в предыдущих сообщениях диалога — отвечай сразу
- Если вопрос конкретный и однозначный — отвечай сразу

ФОРМАТ ОТВЕТА:

Отвечай в Markdown, на русском языке.

КРАТКОСТЬ — ГЛАВНЫЙ ПРИОРИТЕТ:
- Давай КРАТКИЙ структурированный ответ по сути вопроса
- Если в контексте есть список (документов, шагов, требований) — выведи ТОЛЬКО пункты списка без подробных пояснений к каждому
- В конце ответа ВСЕГДА спроси: «Нужны ли подробности по какому-либо пункту?» или аналогичный вопрос
- Подробные пояснения, нюансы и комментарии давай ТОЛЬКО если пользователь попросит

Правила:
- Если в контексте есть нумерованный список — используй нумерованный Markdown-список
- Не придумывай информацию — только из контекста
- Если информации недостаточно — скажи об этом

УКАЗАНИЕ ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ:

В САМОМ КОНЦЕ ответа (после всего текста) добавь НЕВИДИМЫЙ блок:
<!-- USED_SOURCES: [номера источников через запятую] -->

Включай ТОЛЬКО те источники, информация из которых РЕАЛЬНО использована в ответе.

Пример:
<!-- USED_SOURCES: [1, 3] -->

Если это уточняющий вопрос (disambiguation) и ты не формируешь ответ из источников → <!-- USED_SOURCES: [] -->`;
}

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

    // Parse body
    const body = await req.json();
    const missing = findMissingField(body, ["question", "workspace_id"]);
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const {
      question,
      workspace_id,
      template_id,
      conversation_history,
      stream: useStream,
      search_only,
      selected_article_ids,
      selected_qa_ids,
    } = body;

    const uuidFields = ["workspace_id"];
    if (template_id) uuidFields.push("template_id");
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
    const [voyageResult, workspaceResult] = await Promise.all([
      supabaseAdmin.rpc("get_workspace_voyageai_api_key", { workspace_uuid: workspace_id }),
      supabaseAdmin.from("workspaces").select("ai_model").eq("id", workspace_id).single(),
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

    // ── AI-based source selection (search_only mode) ──
    if (search_only) {
      const candidates: SourceCandidate[] = [];

      if (template_id) {
        const articleIds = await resolveTemplateArticleIds(supabaseAdmin, template_id);

        if (articleIds.length > 0) {
          const { data: articles } = await supabaseAdmin
            .from("knowledge_articles")
            .select("id, title, summary")
            .in("id", articleIds)
            .eq("is_published", true);

          for (const a of articles || []) {
            candidates.push({
              id: a.id,
              title: a.title || "Без названия",
              summary: a.summary,
              source_type: "article",
            });
          }
        }
      } else {
        const [articlesResult, qaResult] = await Promise.all([
          supabaseAdmin
            .from("knowledge_articles")
            .select("id, title, summary")
            .eq("workspace_id", workspace_id)
            .eq("is_published", true),
          supabaseAdmin
            .from("knowledge_qa")
            .select("id, question, answer")
            .eq("workspace_id", workspace_id)
            .eq("is_published", true),
        ]);

        for (const a of articlesResult.data || []) {
          candidates.push({
            id: a.id,
            title: a.title || "Без названия",
            summary: a.summary,
            source_type: "article",
          });
        }

        for (const q of qaResult.data || []) {
          candidates.push({
            id: q.id,
            title: q.question,
            summary: q.answer.slice(0, 200),
            source_type: "qa",
          });
        }
      }

      if (candidates.length === 0) {
        return new Response(
          JSON.stringify({ success: true, sources: [], total_chunks: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const selected = await selectSourcesWithAI(aiApiKey, aiModel, question, candidates);

      const candidateMap = new Map(candidates.map((c) => [c.id, c]));
      const rawSources = selected
        .filter((s) => candidateMap.has(s.id))
        .map((s) => {
          const c = candidateMap.get(s.id)!;
          return {
            article_id: c.source_type === "article" ? c.id : null,
            qa_id: c.source_type === "qa" ? c.id : null,
            article_title: c.title,
            similarity: s.relevance,
            chunk_count: 1,
            source_type: c.source_type,
          };
        })
        .sort((a, b) => b.similarity - a.similarity);

      const seenTitles = new Set<string>();
      const allSources = rawSources.filter((s) => {
        const key = s.article_title.toLowerCase().trim();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      });

      console.log(
        `Knowledge search (AI source selection): "${question.slice(0, 50)}..." → ${candidates.length} candidates → ${allSources.length} selected`,
      );

      return new Response(
        JSON.stringify({ success: true, sources: allSources, total_chunks: allSources.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // VoyageAI key required for RAG
    if (!voyageResult.data) {
      return new Response(
        JSON.stringify({ error: "VoyageAI API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const voyageKey = voyageResult.data as string;

    // ── Full RAG pipeline via shared module ──
    const ragResult = await performRag(supabaseAdmin, {
      question,
      workspaceId: workspace_id,
      templateId: template_id,
      voyageKey,
      conversationHistory: conversation_history,
      selectedArticleIds: selected_article_ids,
      selectedQaIds: selected_qa_ids,
    });

    if (!ragResult) {
      const noResultMsg = template_id
        ? "В этом проекте нет статей базы знаний для поиска."
        : "К сожалению, в базе знаний не нашлось информации по вашему вопросу. Попробуйте переформулировать запрос.";
      return new Response(
        JSON.stringify({ success: true, answer: noResultMsg, sources: [], chunks_used: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { contextText, chunks, sources } = ragResult;
    const systemPrompt = buildKnowledgeSystemPrompt(contextText);

    // Build messages
    const ALLOWED_ROLES = new Set(["user", "assistant"]);
    const messages: Array<{ role: string; content: string }> = [];
    if (conversation_history && Array.isArray(conversation_history)) {
      const recent = conversation_history.slice(-20);
      for (const msg of recent) {
        if (ALLOWED_ROLES.has(msg.role) && typeof msg.content === "string") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: "user", content: question });

    console.log(
      `Knowledge search: "${question.slice(0, 50)}..." → ${chunks.length} chunks, model=${aiModel}, stream=${!!useStream}`,
    );

    // ── Streaming mode ──
    if (useStream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            let fullText = "";

            if (useGemini) {
              // Gemini streaming (native SSE via streamGenerateContent)
              let geminiResponse: Response;
              try {
                geminiResponse = await callGeminiStream({
                  apiKey: aiApiKey,
                  model: aiModel,
                  contents: messagesToGeminiContents(messages),
                  systemInstruction: systemPrompt,
                });
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : "Unknown error";
                controller.enqueue(encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ error: `AI error: ${errMsg}` })}\n\n`,
                ));
                controller.close();
                console.error(`Gemini stream error: ${errMsg}`);
                return;
              }

              const reader = geminiResponse.body!.getReader();
              const decoder = new TextDecoder();
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
            } else {
              // Claude streaming (original)
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
                controller.enqueue(encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ error: `AI error: ${claudeResponse.status}` })}\n\n`,
                ));
                controller.close();
                console.error(`Anthropic stream error (${claudeResponse.status}): ${errText}`);
                return;
              }

              const reader = claudeResponse.body!.getReader();
              const decoder = new TextDecoder();
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
                    // Skip malformed JSON
                  }
                }
              }
            }

            const { cleanAnswer, filteredSources } = parseUsedSources(fullText, chunks, sources);

            controller.enqueue(encoder.encode(
              `event: sources\ndata: ${JSON.stringify({ sources: filteredSources, chunks_used: chunks.length })}\n\n`,
            ));
            controller.enqueue(encoder.encode(
              `event: done\ndata: ${JSON.stringify({ answer: cleanAnswer })}\n\n`,
            ));
            controller.close();
          } catch (err) {
            console.error("knowledge-search stream error:", err);
            try {
              controller.enqueue(encoder.encode(
                `event: error\ndata: ${JSON.stringify({ error: "Knowledge search failed" })}\n\n`,
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
    }

    // ── Non-streaming mode ──
    let rawAnswer = "";

    if (useGemini) {
      rawAnswer = await callGeminiApi({
        apiKey: aiApiKey,
        model: aiModel,
        contents: messagesToGeminiContents(messages),
        systemInstruction: systemPrompt,
      });
    } else {
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
        }),
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        throw new Error(`AI API error (${claudeResponse.status}): ${errText}`);
      }

      const claudeData = await claudeResponse.json();
      rawAnswer = claudeData.content?.[0]?.text || "Не удалось получить ответ от AI.";
    }

    const { cleanAnswer, filteredSources } = parseUsedSources(rawAnswer, chunks, sources);

    return new Response(
      JSON.stringify({
        success: true,
        answer: cleanAnswer,
        sources: filteredSources,
        chunks_used: chunks.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("knowledge-search error:", err);
    return new Response(
      JSON.stringify({ error: "Knowledge search failed" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});
