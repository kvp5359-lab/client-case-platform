/**
 * Edge Function: telegram-send-message
 * Отправка сообщений из ЛК в Telegram-группу
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, findMissingField, isValidUUID } from "../_shared/validation.ts";
import { htmlToTelegramHtml, escapeHtmlEntities, isHtmlContent } from "../_shared/htmlFormatting.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken, findEmployeeBot } from "../_shared/telegramBotToken.ts";

interface RequestBody {
  message_id: string;
  project_id: string;
  content: string;
  sender_name: string;
  sender_role: string | null;
  telegram_chat_id: number;
  reply_to_telegram_message_id?: number | null;
  attachments_only?: boolean;
}

// Telegram sendPhoto / sendMediaGroup(type=photo) принимает только эти форматы.
// Остальное (tiff, heic, bmp, svg, ...) уходит через sendDocument.
const TELEGRAM_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isTelegramPhotoMime(mime: unknown): boolean {
  return typeof mime === "string" && TELEGRAM_PHOTO_MIME_TYPES.has(mime.toLowerCase());
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const authHeader = req.headers.get("authorization");
  const internalSecret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");

  let authenticatedUserId: string | null = null;

  if (internalSecret) {
    if (!expectedSecret || internalSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (authHeader) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    authenticatedUserId = user.id;
  } else {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = safeJsonParse<RequestBody>(await req.text());
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const TRACE_ID = `tg-send-${body.message_id?.slice(0, 8) ?? '?'}-${Date.now().toString(36)}`;
    const T0 = Date.now();
    const trace = (event: string, data: Record<string, unknown> = {}) => {
      console.log(JSON.stringify({
        trace_id: TRACE_ID,
        elapsed_ms: Date.now() - T0,
        event,
        message_id: body.message_id,
        chat_id: body.telegram_chat_id,
        ...data,
      }));
    };
    trace("request.start", {
      attachments_only: body.attachments_only ?? false,
      content_len: body.content?.length ?? 0,
      sender_name: body.sender_name,
      has_reply_to: !!body.reply_to_telegram_message_id,
    });

    const requiredFields = body.attachments_only
      ? ["message_id", "telegram_chat_id"]
      : ["message_id", "content", "sender_name", "telegram_chat_id"];
    const missing = findMissingField(body as unknown as Record<string, unknown>, requiredFields);
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isValidUUID(body.message_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid message_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (typeof body.telegram_chat_id !== "number") {
      return new Response(
        JSON.stringify({ error: "telegram_chat_id must be a number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Резолв бота: сначала пробуем личный бот сотрудника-отправителя; если
    // его нет — fallback на бота-секретаря (resolveBotToken).
    // Личный бот = настоящая аватарка/имя в Telegram → префикс "(Имя):" не нужен.
    let senderParticipantId: string | null = null;
    {
      const { data: msgRow } = await serviceClient
        .from("project_messages")
        .select("sender_participant_id")
        .eq("id", body.message_id)
        .maybeSingle();
      senderParticipantId = (msgRow?.sender_participant_id as string | null) ?? null;
    }

    const employeeBot = await findEmployeeBot(
      serviceClient,
      body.telegram_chat_id,
      senderParticipantId,
    );
    trace("bot.findEmployeeBot.result", {
      found: !!employeeBot,
      sender_participant_id: senderParticipantId,
    });
    const resolved =
      employeeBot ?? (await resolveBotToken(serviceClient, body.telegram_chat_id));
    const TELEGRAM_BOT_TOKEN = resolved.token;
    const isEmployeeBot = resolved.senderType === "employee_bot";
    trace("bot.resolved", {
      sender_type: resolved.senderType,
      bot_version: resolved.botVersion,
      integration_id: resolved.integrationId ?? null,
      // Маскируем токен — оставляем только первые 8 символов (id) для идентификации.
      token_prefix: TELEGRAM_BOT_TOKEN.slice(0, 8),
    });

    // Стампим integration_id ТОЛЬКО для личного бота. Это поле обозначает
    // «сообщение в counter этого бота», что важно только в basic-группах,
    // где у каждого бота свой message_id. Секретарские сообщения остаются
    // с null — webhook (тот же секретарь) ищет их по `.is(null)`.
    if (isEmployeeBot && resolved.integrationId) {
      await serviceClient
        .from("project_messages")
        .update({ telegram_bot_integration_id: resolved.integrationId })
        .eq("id", body.message_id);
    }

    if (authenticatedUserId) {
      if (!body.project_id || !isValidUUID(body.project_id)) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: project } = await serviceClient
        .from("projects")
        .select("workspace_id")
        .eq("id", body.project_id)
        .maybeSingle();

      if (!project?.workspace_id) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const isMember = await checkWorkspaceMembership(serviceClient, authenticatedUserId, project.workspace_id);
      if (!isMember) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Через личный бот сотрудника — Telegram сам покажет имя/аватарку, префикс не нужен.
    let showSenderName = !isEmployeeBot;
    if (showSenderName && body.project_id) {
      // thread_id текущего сообщения — без него «последнее сообщение» приходило
      // из любого другого треда того же проекта с тем же channel ("client"). Если
      // тот же сотрудник недавно писал в соседний тред, имя в этом треде ошибочно
      // скрывалось. Фильтр по thread_id скопирует «последнее в этом треде».
      const { data: currentMsg } = await serviceClient
        .from("project_messages")
        .select("thread_id")
        .eq("id", body.message_id)
        .maybeSingle();
      const threadId = currentMsg?.thread_id ?? null;

      const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      let q = serviceClient
        .from("project_messages")
        .select("sender_name, source, telegram_bot_integration_id")
        .eq("project_id", body.project_id)
        .neq("id", body.message_id)
        .gte("created_at", sixtyMinAgo);
      if (threadId) {
        q = q.eq("thread_id", threadId);
      } else {
        // Fallback: если у сообщения нет thread_id — ограничимся каналом, как раньше.
        const { data: chatInfo } = await serviceClient
          .from("project_telegram_chats")
          .select("channel")
          .eq("telegram_chat_id", body.telegram_chat_id)
          .eq("is_active", true)
          .maybeSingle();
        q = q.eq("channel", chatInfo?.channel || "client");
      }

      const { data: lastMsg } = await q
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Скрываем префикс «Имя:» только если предыдущее сообщение было ТОЖЕ
      // отправлено через секретаря (без integration_id). Если предыдущее
      // ушло через личного бота — Telegram отрисовал его с другим именем
      // и аватаркой, поэтому теперь нужно явно показать «Кирилл:».
      const prevWasSecretary =
        lastMsg && (lastMsg.telegram_bot_integration_id as string | null) == null;
      if (
        lastMsg &&
        lastMsg.sender_name === body.sender_name &&
        lastMsg.source === "web" &&
        prevWasSecretary
      ) {
        showSenderName = false;
      }
    }

    const isAttachmentsOnlyContent = body.content === "\ud83d\udcce";
    if (!body.attachments_only && !isAttachmentsOnlyContent) {
      const contentForTelegram = isHtmlContent(body.content)
        ? htmlToTelegramHtml(body.content)
        : escapeHtmlEntities(body.content);
      const formattedText = showSenderName
        ? `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`
        : contentForTelegram;

      const payload: Record<string, unknown> = {
        chat_id: body.telegram_chat_id,
        text: formattedText,
        parse_mode: "HTML",
      };

      if (body.reply_to_telegram_message_id) {
        payload.reply_parameters = {
          message_id: body.reply_to_telegram_message_id,
        };
      }

      let tgResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      let tgData = await tgResponse.json();
      let activeToken = TELEGRAM_BOT_TOKEN;
      let activeIntegrationId = resolved.integrationId;

      // Fallback: если личный бот не смог отправить (например, его нет
      // в этом чате — Telegram возвращает "bot is not a member of the
      // group chat"), переотправляем через бота-секретаря с приставкой
      // «(Имя):» в тексте. Сохраняем диагностику.
      if (!tgData.ok && isEmployeeBot) {
        console.warn(
          "[telegram-send-message] employee bot send failed, falling back to secretary:",
          tgData.description,
        );
        const fallback = await resolveBotToken(serviceClient, body.telegram_chat_id);
        const secretaryFormatted = `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`;
        const secretaryPayload = { ...payload, text: secretaryFormatted };
        tgResponse = await fetch(
          `https://api.telegram.org/bot${fallback.token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(secretaryPayload),
          },
        );
        tgData = await tgResponse.json();
        activeToken = fallback.token;
        // Секретарь отправил → integration_id личного бота больше не актуален,
        // снимаем стамп, чтобы edit/delete/reaction роутились по секретарю.
        activeIntegrationId = null;
        await serviceClient
          .from("project_messages")
          .update({ telegram_bot_integration_id: null })
          .eq("id", body.message_id);
      }

      if (tgData.ok && tgData.result?.message_id) {
        await serviceClient
          .from("project_messages")
          .update({
            telegram_message_id: tgData.result.message_id,
            telegram_chat_id: body.telegram_chat_id,
          })
          .eq("id", body.message_id);
      } else {
        console.error("Telegram API error:", tgData);
      }

      // (только для устранения unused-warn'ов)
      void activeToken;
      void activeIntegrationId;
    }

    if (body.attachments_only && body.message_id) {
      const hasText = body.content && body.content !== "\ud83d\udcce";
      let attachmentsOk = false;

      if (hasText) {
        const contentForTelegram = isHtmlContent(body.content)
          ? htmlToTelegramHtml(body.content)
          : escapeHtmlEntities(body.content);
        const formattedCaption = showSenderName
          ? `<b>${escapeHtmlEntities(body.sender_name || "")}:</b>\n${contentForTelegram}`
          : contentForTelegram;

        // Считаем, сколько будет вложений — чтобы решить, как слать текст.
        // При 2+ файлах caption на media-альбоме Telegram рисует между 1-м и 2-м
        // файлом (выглядит странно), поэтому в этом случае шлём текст отдельным
        // sendMessage ПЕРЕД альбомом. При 1 файле оставляем caption — получается
        // один баббл (текст под файлом).
        const { count: attachmentsCount } = await serviceClient
          .from("message_attachments")
          .select("id", { count: "exact", head: true })
          .eq("message_id", body.message_id);

        const sendTextAsSeparateMessage =
          formattedCaption.length > 1024 || (attachmentsCount ?? 0) >= 2;

        if (!sendTextAsSeparateMessage) {
          attachmentsOk = await sendAttachmentsWithFallback({
            messageId: body.message_id,
            chatId: body.telegram_chat_id,
            supabaseClient: serviceClient,
            primaryToken: TELEGRAM_BOT_TOKEN,
            caption: formattedCaption,
            replyTo: body.reply_to_telegram_message_id ?? undefined,
            isEmployeeBot,
            senderName: body.sender_name,
          });
        } else {
          const payload: Record<string, unknown> = {
            chat_id: body.telegram_chat_id,
            text: formattedCaption,
            parse_mode: "HTML",
          };
          if (body.reply_to_telegram_message_id) {
            payload.reply_parameters = { message_id: body.reply_to_telegram_message_id };
          }

          let tgRes = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
          );
          let tgData = await tgRes.json();

          // Fallback на секретаря для split-текста: если личный бот не в группе
          // ("bot is not a member of the group chat"), переотправляем сообщение
          // через секретаря с префиксом "<Имя>:" в начале. Симметрично fallback'у
          // в обычной текстовой ветке (строки 305-330): без него split-текст
          // (2+ файла или caption > 1024) терялся при отсутствии личного бота
          // в группе, в то время как файлы доходили через sendAttachmentsWithFallback.
          if (!tgData.ok && isEmployeeBot) {
            console.warn(
              "[telegram-send-message] split-text employee bot send failed, falling back to secretary:",
              tgData.description,
            );
            const fallback = await resolveBotToken(serviceClient, body.telegram_chat_id);
            const secretaryFormatted = `<b>${escapeHtmlEntities(body.sender_name || "")}:</b>\n${contentForTelegram}`;
            const secretaryPayload = { ...payload, text: secretaryFormatted };
            tgRes = await fetch(
              `https://api.telegram.org/bot${fallback.token}/sendMessage`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(secretaryPayload) },
            );
            tgData = await tgRes.json();
            // Секретарь отправил → integration_id больше не актуален.
            await serviceClient
              .from("project_messages")
              .update({ telegram_bot_integration_id: null })
              .eq("id", body.message_id);
          }

          if (tgData.ok && tgData.result?.message_id) {
            await serviceClient
              .from("project_messages")
              .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: body.telegram_chat_id })
              .eq("id", body.message_id);
          }

          attachmentsOk = await sendAttachmentsWithFallback({
            messageId: body.message_id,
            chatId: body.telegram_chat_id,
            supabaseClient: serviceClient,
            primaryToken: TELEGRAM_BOT_TOKEN,
            skipIdUpdate: true,
            isEmployeeBot,
            senderName: body.sender_name,
          });
        }
      } else {
        attachmentsOk = await sendAttachmentsWithFallback({
          messageId: body.message_id,
          chatId: body.telegram_chat_id,
          supabaseClient: serviceClient,
          primaryToken: TELEGRAM_BOT_TOKEN,
          replyTo: body.reply_to_telegram_message_id ?? undefined,
          isEmployeeBot,
          senderName: body.sender_name,
        });
      }

      await serviceClient
        .from("project_messages")
        .update({ telegram_attachments_delivered: attachmentsOk })
        .eq("id", body.message_id);
      trace("attachments.done", { ok: attachmentsOk });
    }

    trace("request.end", { total_ms: Date.now() - T0 });
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("telegram-send-message error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function resolveAttachment(
  att: Record<string, unknown>,
  supabaseClient: ReturnType<typeof createClient>,
): Promise<{ blob: Blob; fileName: string; mimeType: string | null } | null> {
  try {
    let bucket = "message-attachments";
    let storagePath = att.storage_path as string;
    if (att.file_id) {
      const { data: fileRecord } = await supabaseClient
        .from("files")
        .select("bucket, storage_path")
        .eq("id", att.file_id)
        .single();
      if (fileRecord) {
        bucket = fileRecord.bucket;
        storagePath = fileRecord.storage_path;
      }
    }

    const { data: urlData } = await supabaseClient.storage
      .from(bucket)
      .createSignedUrl(storagePath, 300);

    if (!urlData?.signedUrl) {
      console.error("resolveAttachment: no signedUrl for", att.file_name, "bucket:", bucket, "path:", storagePath);
      return null;
    }

    const fileRes = await fetch(urlData.signedUrl);
    if (!fileRes.ok) {
      console.error("resolveAttachment: fetch failed", fileRes.status, "for", att.file_name);
      return null;
    }
    const blob = await fileRes.blob();
    return { blob, fileName: att.file_name as string, mimeType: (att.mime_type as string) ?? null };
  } catch (err) {
    console.error("resolveAttachment error for", att.file_name, ":", err);
    return null;
  }
}

/**
 * Wrapper над sendAttachments: при ошибке отправки через личный бот сотрудника
 * (его нет в группе → Telegram возвращает «bot is not a member of the group
 * chat»), повторяет отправку через бот-секретаря этой группы. По аналогии с
 * текстовой веткой (строки 274-296), которая тоже fallback'ит.
 *
 * Если caption присутствовал у personal-bot попытки — у secretary-бота
 * добавляем префикс «<Имя>:», чтобы получатель понимал автора.
 */
async function sendAttachmentsWithFallback(
  args: {
    messageId: string;
    chatId: number;
    supabaseClient: ReturnType<typeof createClient>;
    primaryToken: string;
    caption?: string;
    replyTo?: number;
    skipIdUpdate?: boolean;
    isEmployeeBot: boolean;
    senderName?: string;
  },
): Promise<boolean> {
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "primary.start",
    is_employee_bot: args.isEmployeeBot,
    primary_token_prefix: args.primaryToken.slice(0, 8),
    has_caption: !!args.caption,
  }));
  const ok = await sendAttachments(
    args.messageId, args.chatId, args.supabaseClient,
    args.primaryToken, args.caption, args.replyTo, args.skipIdUpdate ?? false,
  );
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "primary.result",
    ok,
    will_fallback: !ok && args.isEmployeeBot,
  }));
  if (ok || !args.isEmployeeBot) return ok;

  console.warn("[telegram-send-message] employee bot attachments send failed, falling back to secretary");
  let fallback;
  try {
    fallback = await resolveBotToken(args.supabaseClient, args.chatId);
  } catch (e) {
    console.error("[telegram-send-message] secretary token resolve failed:", e);
    return false;
  }
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "fallback.start",
    fallback_token_prefix: fallback.token.slice(0, 8),
  }));

  const fallbackCaption = args.caption
    ? `<b>${escapeHtmlEntities(args.senderName ?? "")}:</b>\n${args.caption}`
    : args.caption;

  const fallbackOk = await sendAttachments(
    args.messageId, args.chatId, args.supabaseClient,
    fallback.token, fallbackCaption, args.replyTo, args.skipIdUpdate ?? false,
  );
  console.log(JSON.stringify({
    sub: "sendAttachmentsWithFallback",
    message_id: args.messageId,
    event: "fallback.result",
    ok: fallbackOk,
  }));
  return fallbackOk;
}

async function sendAttachments(
  messageId: string,
  chatId: number,
  supabaseClient: ReturnType<typeof createClient>,
  botToken: string,
  caption?: string,
  replyToTelegramMessageId?: number,
  skipTelegramIdUpdate = false,
): Promise<boolean> {
  const sendStart = Date.now();
  const sendTrace = (event: string, data: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({
      sub: "sendAttachments",
      message_id: messageId,
      chat_id: chatId,
      token_prefix: botToken.slice(0, 8),
      elapsed_ms: Date.now() - sendStart,
      event,
      ...data,
    }));
  };

  const { data: attachments } = await supabaseClient
    .from("message_attachments")
    .select("*")
    .eq("message_id", messageId);

  if (!attachments || attachments.length === 0) {
    sendTrace("no_attachments_in_db");
    await supabaseClient
      .from("project_messages")
      .update({ telegram_error_detail: "sendAttachments: no attachments found in DB" })
      .eq("id", messageId);
    return false;
  }

  let allSucceeded = true;

  // Только JPEG/PNG/WEBP/GIF уходят как photo в Telegram.
  // Всё остальное (tiff, heic, bmp, svg, pdf, docs, ...) — как document.
  const images = attachments.filter((a: Record<string, unknown>) => isTelegramPhotoMime(a.mime_type));
  const others = attachments.filter((a: Record<string, unknown>) => !isTelegramPhotoMime(a.mime_type));

  sendTrace("attachments.partition", {
    total: attachments.length,
    images: images.length,
    others: others.length,
    mimes: attachments.map((a: Record<string, unknown>) => a.mime_type),
  });

  if (images.length >= 2) {
    const chunks: typeof images[] = [];
    for (let i = 0; i < images.length; i += 10) {
      chunks.push(images.slice(i, i + 10));
    }

    let isFirstChunk = true;
    for (const chunk of chunks) {
      try {
        const resolved = await Promise.all(chunk.map((a: Record<string, unknown>) => resolveAttachment(a, supabaseClient)));

        const formData = new FormData();
        formData.append("chat_id", String(chatId));

        const media: Record<string, unknown>[] = [];
        resolved.forEach((r: { blob: Blob; fileName: string; mimeType: string | null } | null, idx: number) => {
          if (!r) return;
          const attachKey = `attach_${idx}`;
          formData.append(attachKey, r.blob, r.fileName);
          const item: Record<string, unknown> = {
            type: "photo",
            media: `attach://${attachKey}`,
          };
          if (isFirstChunk && idx === 0 && caption) {
            item.caption = caption.slice(0, 1024);
            item.parse_mode = "HTML";
          }
          media.push(item);
        });

        formData.append("media", JSON.stringify(media));

        if (isFirstChunk && replyToTelegramMessageId) {
          formData.append("reply_parameters", JSON.stringify({
            message_id: replyToTelegramMessageId,
          }));
        }

        const fetchStart = Date.now();
        sendTrace("sendMediaGroup.start", { chunk_size: chunk.length, is_first: isFirstChunk });
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendMediaGroup.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
        });
        if (!tgData.ok) {
          console.error("Telegram sendMediaGroup error:", JSON.stringify(tgData));
          allSucceeded = false;
        }

        if (isFirstChunk && !skipTelegramIdUpdate && tgData.ok) {
          const firstMsgId = Array.isArray(tgData.result) ? tgData.result[0]?.message_id : null;
          if (firstMsgId) {
            await supabaseClient
              .from("project_messages")
              .update({ telegram_message_id: firstMsgId, telegram_chat_id: chatId })
              .eq("id", messageId);
          }
        }
        // Добавляем в telegram_message_ids все id медиа-группы (не только первый),
        // чтобы реакция на любой элемент группы нашла исходник.
        if (!skipTelegramIdUpdate && tgData.ok && Array.isArray(tgData.result)) {
          for (const item of tgData.result) {
            if (item?.message_id) {
              await supabaseClient.rpc("append_telegram_message_id", {
                p_message_id: messageId,
                p_tg_msg_id: item.message_id,
                p_chat_id: chatId,
              });
            }
          }
        }

        isFirstChunk = false;
      } catch (err) {
        console.error("Error sending media group to TG:", err);
        allSucceeded = false;
      }
    }
  } else if (images.length === 1) {
    try {
      const r = await resolveAttachment(images[0], supabaseClient);
      if (r) {
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("photo", r.blob, r.fileName);
        if (caption) {
          formData.append("caption", caption.slice(0, 1024));
          formData.append("parse_mode", "HTML");
        }
        if (replyToTelegramMessageId) {
          formData.append("reply_parameters", JSON.stringify({ message_id: replyToTelegramMessageId }));
        }

        const fetchStart = Date.now();
        sendTrace("sendPhoto.start");
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendPhoto`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendPhoto.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
        });
        if (!tgData.ok) {
          console.error("Telegram sendPhoto error:", JSON.stringify(tgData));
          allSucceeded = false;
        }

        if (!skipTelegramIdUpdate && tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: chatId })
            .eq("id", messageId);
        }
      }
    } catch (err) {
      console.error("Error sending photo to TG:", err);
      allSucceeded = false;
    }
  }

  // Документы: 2+ файла отправляем одним альбомом (sendMediaGroup type=document),
  // чтобы в TG получился один баббл. Один файл — обычный sendDocument с caption.
  const documentsCaptionAvailable = images.length === 0 ? caption : undefined;
  const documentsReplyTo = images.length === 0 ? replyToTelegramMessageId : undefined;

  if (others.length >= 2) {
    // Telegram API: media group принимает 2-10 элементов. Бьём на чанки по 10.
    const chunks: typeof others[] = [];
    for (let i = 0; i < others.length; i += 10) {
      chunks.push(others.slice(i, i + 10));
    }

    let isFirstChunk = true;
    for (const chunk of chunks) {
      try {
        const resolved = await Promise.all(chunk.map((a) => resolveAttachment(a, supabaseClient)));

        const nullCount = resolved.filter((r) => !r).length;
        if (nullCount > 0) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_error_detail: `sendMediaGroup(document): ${nullCount}/${resolved.length} attachments failed to resolve` })
            .eq("id", messageId);
        }

        const formData = new FormData();
        formData.append("chat_id", String(chatId));

        const media: Record<string, unknown>[] = [];
        resolved.forEach((r, idx) => {
          if (!r) return;
          const attachKey = `attach_doc_${idx}`;
          formData.append(attachKey, r.blob, r.fileName);
          const item: Record<string, unknown> = {
            type: "document",
            media: `attach://${attachKey}`,
          };
          if (isFirstChunk && idx === 0 && documentsCaptionAvailable) {
            item.caption = documentsCaptionAvailable.slice(0, 1024);
            item.parse_mode = "HTML";
          }
          media.push(item);
        });

        formData.append("media", JSON.stringify(media));

        if (isFirstChunk && documentsReplyTo) {
          formData.append("reply_parameters", JSON.stringify({ message_id: documentsReplyTo }));
        }

        const fetchStart = Date.now();
        sendTrace("sendMediaGroup.docs.start", { chunk_size: chunk.length, is_first: isFirstChunk });
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendMediaGroup.docs.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
        });
        if (!tgData.ok) {
          console.error("Telegram sendMediaGroup (document) error:", JSON.stringify(tgData));
          allSucceeded = false;
          // Пишем причину в БД — чтобы потом можно было посмотреть SQL-запросом.
          await supabaseClient
            .from("project_messages")
            .update({ telegram_error_detail: `sendMediaGroup(document): ${JSON.stringify(tgData).slice(0, 500)}` })
            .eq("id", messageId);
        }

        if (isFirstChunk && !skipTelegramIdUpdate && images.length === 0 && tgData.ok) {
          const firstMsgId = Array.isArray(tgData.result) ? tgData.result[0]?.message_id : null;
          if (firstMsgId) {
            await supabaseClient
              .from("project_messages")
              .update({ telegram_message_id: firstMsgId, telegram_chat_id: chatId })
              .eq("id", messageId);
          }
        }
        if (!skipTelegramIdUpdate && tgData.ok && Array.isArray(tgData.result)) {
          for (const item of tgData.result) {
            if (item?.message_id) {
              await supabaseClient.rpc("append_telegram_message_id", {
                p_message_id: messageId,
                p_tg_msg_id: item.message_id,
                p_chat_id: chatId,
              });
            }
          }
        }

        isFirstChunk = false;
      } catch (err) {
        console.error("Error sending document group to TG:", err);
        allSucceeded = false;
      }
    }
  } else if (others.length === 1) {
    // Один документ — обычный sendDocument с caption.
    try {
      const r = await resolveAttachment(others[0], supabaseClient);
      if (!r) {
        allSucceeded = false;
      } else {
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("document", r.blob, r.fileName);

        if (documentsCaptionAvailable) {
          formData.append("caption", documentsCaptionAvailable.slice(0, 1024));
          formData.append("parse_mode", "HTML");
        }
        if (documentsReplyTo) {
          formData.append("reply_parameters", JSON.stringify({ message_id: documentsReplyTo }));
        }

        const fetchStart = Date.now();
        sendTrace("sendDocument.start", { file_name: r.fileName });
        const tgResult = await fetch(
          `https://api.telegram.org/bot${botToken}/sendDocument`,
          { method: "POST", body: formData },
        );

        const tgData = await tgResult.json();
        sendTrace("sendDocument.response", {
          http_status: tgResult.status,
          api_ok: tgData.ok,
          error_code: tgData.error_code ?? null,
          description: tgData.description ?? null,
          duration_ms: Date.now() - fetchStart,
          file_name: r.fileName,
        });
        if (!tgData.ok) {
          console.error("Telegram sendDocument error:", JSON.stringify(tgData), "file:", r.fileName);
          allSucceeded = false;
        }

        if (!skipTelegramIdUpdate && images.length === 0 && tgData.ok && tgData.result?.message_id) {
          await supabaseClient
            .from("project_messages")
            .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: chatId })
            .eq("id", messageId);
        }
        if (!skipTelegramIdUpdate && tgData.ok && tgData.result?.message_id) {
          await supabaseClient.rpc("append_telegram_message_id", {
            p_message_id: messageId,
            p_tg_msg_id: tgData.result.message_id,
            p_chat_id: chatId,
          });
        }
      }
    } catch (err) {
      console.error("Error sending document to TG:", err);
      allSucceeded = false;
    }
  }

  return allSucceeded;
}
