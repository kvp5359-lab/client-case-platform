/**
 * translate-message — перевод текста сообщения на указанный язык через LLM
 * воркспейса (Anthropic/Gemini, ключ из настроек).
 *
 * Два режима через payload:
 *
 *   1) Перевод существующего сообщения с кэшированием:
 *      { message_id: uuid, target_language: string }
 *      → проверяет RLS-доступ к сообщению, переводит, кладёт в
 *        message_translations (PK message_id+target_language), возвращает.
 *      → если уже есть в кэше — возвращает кэш, LLM не дёргается.
 *
 *   2) Превью без сохранения (для композера на исходящих):
 *      { workspace_id: uuid, content: string, target_language: string,
 *        source_language?: string }
 *      → только переводит, ничего не пишет в БД.
 *
 * Авторизация: verify_jwt=true (только из фронта).
 */

import { jsonRes, preflight, getUserClient, getServiceClient } from "../_shared/edge.ts";
import { setupAiChat, callAiApi } from "../_shared/ai-chat-setup.ts";

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "Russian",
  en: "English",
  es: "Spanish",
  uk: "Ukrainian",
  de: "German",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
  tr: "Turkish",
  ar: "Arabic",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
  he: "Hebrew",
  nl: "Dutch",
  cs: "Czech",
  ro: "Romanian",
  bg: "Bulgarian",
  el: "Greek",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

function htmlToPlain(html: string): string {
  if (!/<[a-z][\s\S]*?>/i.test(html)) return html;
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "• ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Email-HTML часто содержит декоративные table-cells, пустые <p>, &nbsp;,
  // <img> для брендинга → после strip остаются строки только из пробелов.
  // Превращаем такие в чистые \n, иначе LLM сохранит их как «параграфы»
  // и в выводе появятся пустые баблы между блоками.
  s = s.split("\n").map((line) => (line.trim() ? line : "")).join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function plainToSimpleHtml(plain: string, originalWasHtml: boolean): string {
  if (!originalWasHtml) return plain;
  const escape = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return plain
    .split(/\n{2,}/)
    .map((para) => para.trim())
    // Фильтруем пустые параграфы — иначе пустые <p></p> рендерятся как
    // широкие визуальные «дыры» в баббле перевода (видно особенно на
    // переводах email с декоративными table-cells / <img/>).
    .filter((para) => para.length > 0)
    .map((para) => `<p>${escape(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Кусочек истории треда, который кладём в системный промпт перевода. */
interface ContextMessage {
  author: string;
  text: string;
}

function buildSystemPrompt(opts: {
  targetLang: string;
  sourceLang?: string;
  context?: ContextMessage[];
}): string {
  const sourceClause = opts.sourceLang ? `from ${languageName(opts.sourceLang)} ` : "";
  let prompt =
    `You are a professional translator. Translate the user's text ${sourceClause}to ${languageName(opts.targetLang)}. ` +
    `Preserve line breaks and paragraph structure exactly. ` +
    `Do NOT add explanations, prefaces, quotes, or markdown. ` +
    `Output ONLY the translated text, nothing else. ` +
    `If the text is already in the target language, return it unchanged.`;

  if (opts.context && opts.context.length > 0) {
    const ctxBlock = opts.context
      .map((m) => `${m.author}: ${m.text}`)
      .join("\n");
    prompt +=
      `\n\n# Recent conversation context\n` +
      `Below are the most recent messages of this conversation, oldest first. ` +
      `Use them ONLY to keep terminology, formal/informal tone, and named entities consistent. ` +
      `Do NOT translate or output them — only the user's next text.\n` +
      ctxBlock;
  }

  return prompt;
}

async function translateText(opts: {
  apiKey: string;
  model: string;
  text: string;
  targetLang: string;
  sourceLang?: string;
  geminiThinkingBudget?: number;
  context?: ContextMessage[];
  req: Request;
}): Promise<{ translated: string } | Response> {
  const systemPrompt = buildSystemPrompt({
    targetLang: opts.targetLang,
    sourceLang: opts.sourceLang,
    context: opts.context,
  });

  const result = await callAiApi(opts.req, {
    apiKey: opts.apiKey,
    model: opts.model,
    systemPrompt,
    messages: [{ role: "user", content: opts.text }],
    maxTokens: 4096,
    geminiThinkingBudget: opts.geminiThinkingBudget,
  });

  if (result instanceof Response) return result;
  return { translated: result.answer.trim() };
}

/** Загружает translation_model + use_thread_context из воркспейса. */
async function loadTranslationSettings(
  service: ReturnType<typeof getServiceClient>,
  workspaceId: string,
): Promise<{ model: string | null; useThreadContext: boolean }> {
  const { data } = await service
    .from("workspaces")
    .select("translation_model, translation_use_thread_context")
    .eq("id", workspaceId)
    .maybeSingle();
  const row = (data ?? {}) as {
    translation_model?: string | null;
    translation_use_thread_context?: boolean | null;
  };
  return {
    model: row.translation_model ?? null,
    useThreadContext: !!row.translation_use_thread_context,
  };
}

/** Тянет ~5 последних сообщений треда (без переводимого). Plain text. */
async function loadThreadContext(
  service: ReturnType<typeof getServiceClient>,
  threadId: string,
  excludeMessageId?: string,
  limit = 5,
): Promise<ContextMessage[]> {
  let query = service
    .from("project_messages")
    .select("id, content, sender_name, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (excludeMessageId) query = query.neq("id", excludeMessageId);
  const { data } = await query;
  if (!data) return [];
  return (data as Array<{ content: string; sender_name: string | null }>)
    .map((r) => ({
      author: r.sender_name || "?",
      text: htmlToPlain(r.content).slice(0, 400),
    }))
    .filter((m) => m.text.trim())
    .reverse(); // oldest first для модели
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405, req);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonRes({ error: "Unauthorized" }, 401, req);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "Invalid JSON" }, 400, req);
  }

  const targetLanguage = String(body.target_language ?? "").toLowerCase().trim();
  if (!targetLanguage) {
    return jsonRes({ error: "target_language required" }, 400, req);
  }

  const messageId = body.message_id ? String(body.message_id) : null;

  // ─── Режим 1: перевод существующего сообщения с кэшированием ──────────
  if (messageId) {
    const userClient = getUserClient(req);
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return jsonRes({ error: "Unauthorized" }, 401, req);

    // Загружаем сообщение через user client → RLS отсечёт чужие
    const { data: message, error: msgErr } = await userClient
      .from("project_messages")
      .select("id, workspace_id, thread_id, content, original_content, original_language")
      .eq("id", messageId)
      .maybeSingle();

    if (msgErr || !message) {
      return jsonRes({ error: "Message not found or access denied" }, 404, req);
    }

    const service = getServiceClient();

    // Проверяем кэш
    const { data: cached } = await service
      .from("message_translations")
      .select("translated_content, source_language, model")
      .eq("message_id", messageId)
      .eq("target_language", targetLanguage)
      .maybeSingle();

    if (cached) {
      return jsonRes({
        translated_content: cached.translated_content,
        target_language: targetLanguage,
        source_language: cached.source_language,
        model: cached.model,
        cached: true,
      }, 200, req);
    }

    // Источник перевода — оригинал автора (если есть) или сам content
    const sourceText: string = (message.original_content as string | null) ?? (message.content as string);
    const sourceLang: string | undefined = (message.original_language as string | null) ?? undefined;
    const originalWasHtml = /<[a-z][\s\S]*?>/i.test(sourceText);
    const plain = htmlToPlain(sourceText);

    if (!plain.trim()) {
      return jsonRes({ error: "Empty message content" }, 400, req);
    }

    // setupAiChat подгрузит ai_model + apiKey + проверит membership
    const setup = await setupAiChat(req, authHeader, message.workspace_id as string);
    if (setup instanceof Response) return setup;

    // Translation-specific overrides: модель и контекст треда
    const tSettings = await loadTranslationSettings(service, message.workspace_id as string);
    const effectiveModel = tSettings.model ?? setup.aiModel;
    let context: ContextMessage[] | undefined;
    if (tSettings.useThreadContext && message.thread_id) {
      context = await loadThreadContext(service, message.thread_id as string, messageId);
    }

    const translation = await translateText({
      req,
      apiKey: setup.apiKey,
      model: effectiveModel,
      text: plain,
      targetLang: targetLanguage,
      sourceLang,
      geminiThinkingBudget: setup.geminiThinkingBudget,
      context,
    });
    if (translation instanceof Response) return translation;

    const finalContent = plainToSimpleHtml(translation.translated, originalWasHtml);

    // Кэшируем (service role обходит RLS)
    await service.from("message_translations").upsert({
      message_id: messageId,
      target_language: targetLanguage,
      translated_content: finalContent,
      source_language: sourceLang ?? null,
      model: effectiveModel,
      created_by: userData.user.id,
    }, { onConflict: "message_id,target_language" });

    return jsonRes({
      translated_content: finalContent,
      target_language: targetLanguage,
      source_language: sourceLang ?? null,
      model: effectiveModel,
      cached: false,
    }, 200, req);
  }

  // ─── Режим 2: превью без сохранения ───────────────────────────────────
  const workspaceId = body.workspace_id ? String(body.workspace_id) : null;
  const content = body.content ? String(body.content) : null;
  const sourceLanguage = body.source_language ? String(body.source_language).toLowerCase().trim() : undefined;
  // Опциональный thread_id для preview-режима — позволяет подмешивать контекст
  // треда при переводе исходящего в композере (если он включён в настройках ws).
  const previewThreadId = body.thread_id ? String(body.thread_id) : null;

  if (!workspaceId || !content) {
    return jsonRes({ error: "workspace_id and content (or message_id) required" }, 400, req);
  }

  const originalWasHtml = /<[a-z][\s\S]*?>/i.test(content);
  const plain = htmlToPlain(content);
  if (!plain.trim()) {
    return jsonRes({ error: "Empty content" }, 400, req);
  }

  const setup = await setupAiChat(req, authHeader, workspaceId);
  if (setup instanceof Response) return setup;

  // Translation-specific overrides
  const previewService = getServiceClient();
  const previewSettings = await loadTranslationSettings(previewService, workspaceId);
  const previewModel = previewSettings.model ?? setup.aiModel;
  let previewContext: ContextMessage[] | undefined;
  if (previewSettings.useThreadContext && previewThreadId) {
    previewContext = await loadThreadContext(previewService, previewThreadId);
  }

  const translation = await translateText({
    req,
    apiKey: setup.apiKey,
    model: previewModel,
    text: plain,
    targetLang: targetLanguage,
    sourceLang: sourceLanguage,
    geminiThinkingBudget: setup.geminiThinkingBudget,
    context: previewContext,
  });
  if (translation instanceof Response) return translation;

  return jsonRes({
    translated_content: plainToSimpleHtml(translation.translated, originalWasHtml),
    target_language: targetLanguage,
    source_language: sourceLanguage ?? null,
    model: previewModel,
    cached: false,
  }, 200, req);
});
