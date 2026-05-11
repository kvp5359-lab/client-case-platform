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
import { detectChatMigration } from "../_shared/telegramMigration.ts";
import { isReplyNotFoundError, loadReplyQuoteHtml } from "./helpers.ts";
import { sendAttachmentsWithFallback } from "./attachments.ts";

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

      let activeChatId = body.telegram_chat_id;
      const payload: Record<string, unknown> = {
        chat_id: activeChatId,
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

      // Обработка апгрейда группы → супергруппы. Если Telegram вернул
      // migrate_to_chat_id, обновляем project_telegram_chats и повторяем
      // отправку с новым chat_id (тем же ботом). Только тогда переходим к
      // fallback на секретаря — если retry тоже упал по другой причине.
      const migratedChatId = await detectChatMigration(serviceClient, activeChatId, tgData);
      if (migratedChatId !== null) {
        activeChatId = migratedChatId;
        payload.chat_id = migratedChatId;
        tgResponse = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        tgData = await tgResponse.json();
      }

      // Fallback на «висячий» reply: Telegram отбил отправку, потому что
      // reply_parameters.message_id указывает на сообщение, которого больше
      // нет (типичный кейс — миграция группы в супергруппу обнулила старые
      // message_id, маппинг API не отдаёт). Шлём тем же ботом без
      // reply_parameters, но с blockquote-цитатой текста оригинала в начале —
      // визуально клиент увидит, на что отвечают.
      if (!tgData.ok && isReplyNotFoundError(tgData) && payload.reply_parameters) {
        const quote = await loadReplyQuoteHtml(serviceClient, body.message_id);
        delete payload.reply_parameters;
        if (quote) {
          payload.text = `${quote}\n${formattedText}`;
        }
        tgResponse = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        tgData = await tgResponse.json();
        if (tgData.ok) {
          await serviceClient
            .from("project_messages")
            .update({
              telegram_error_detail: `reply_dropped: original message_id=${body.reply_to_telegram_message_id} not in chat (likely supergroup migration); via=text`,
            })
            .eq("id", body.message_id);
        }
      }

      // Fallback: если личный бот не смог отправить (например, его нет
      // в этом чате — Telegram возвращает "bot is not a member of the
      // group chat"), переотправляем через бота-секретаря с приставкой
      // «(Имя):» в тексте. Сохраняем диагностику.
      if (!tgData.ok && isEmployeeBot) {
        const employeeErrorDescription = tgData.description ?? "unknown";
        console.warn(
          "[telegram-send-message] employee bot send failed, falling back to secretary:",
          employeeErrorDescription,
        );
        const fallback = await resolveBotToken(serviceClient, activeChatId);
        const secretaryFormatted = `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`;
        const secretaryPayload = { ...payload, chat_id: activeChatId, text: secretaryFormatted };
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
        // В telegram_error_detail пишем причину fallback'а (description от Telegram +
        // флаг reply) — чтобы post-mortem можно было сделать SQL-запросом, а не
        // лазать в Supabase Functions Logs.
        activeIntegrationId = null;
        const fallbackDetail = `employee_bot_send_failed: ${employeeErrorDescription}; reply=${body.reply_to_telegram_message_id ?? "no"}; via=text`;
        await serviceClient
          .from("project_messages")
          .update({ telegram_bot_integration_id: null, telegram_error_detail: fallbackDetail })
          .eq("id", body.message_id);
      }

      if (tgData.ok && tgData.result?.message_id) {
        await serviceClient
          .from("project_messages")
          .update({
            telegram_message_id: tgData.result.message_id,
            telegram_chat_id: activeChatId,
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
          let activeChatId = body.telegram_chat_id;
          const payload: Record<string, unknown> = {
            chat_id: activeChatId,
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

          // Апгрейд группы → супергруппы: повторяем с новым chat_id.
          const migratedSplit = await detectChatMigration(serviceClient, activeChatId, tgData);
          if (migratedSplit !== null) {
            activeChatId = migratedSplit;
            payload.chat_id = migratedSplit;
            tgRes = await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
            );
            tgData = await tgRes.json();
          }

          // Fallback на «висячий» reply (см. коммент в текстовой ветке выше):
          // переотправка тем же ботом без reply_parameters, с blockquote-цитатой.
          if (!tgData.ok && isReplyNotFoundError(tgData) && payload.reply_parameters) {
            const quote = await loadReplyQuoteHtml(serviceClient, body.message_id);
            delete payload.reply_parameters;
            if (quote) {
              payload.text = `${quote}\n${formattedCaption}`;
            }
            tgRes = await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
            );
            tgData = await tgRes.json();
            if (tgData.ok) {
              await serviceClient
                .from("project_messages")
                .update({
                  telegram_error_detail: `reply_dropped: original message_id=${body.reply_to_telegram_message_id} not in chat (likely supergroup migration); via=split-text`,
                })
                .eq("id", body.message_id);
            }
          }

          // Fallback на секретаря для split-текста: если личный бот не в группе
          // ("bot is not a member of the group chat"), переотправляем сообщение
          // через секретаря с префиксом "<Имя>:" в начале. Симметрично fallback'у
          // в обычной текстовой ветке (строки 305-330): без него split-текст
          // (2+ файла или caption > 1024) терялся при отсутствии личного бота
          // в группе, в то время как файлы доходили через sendAttachmentsWithFallback.
          if (!tgData.ok && isEmployeeBot) {
            const splitErrorDescription = tgData.description ?? "unknown";
            console.warn(
              "[telegram-send-message] split-text employee bot send failed, falling back to secretary:",
              splitErrorDescription,
            );
            const fallback = await resolveBotToken(serviceClient, activeChatId);
            const secretaryFormatted = `<b>${escapeHtmlEntities(body.sender_name || "")}:</b>\n${contentForTelegram}`;
            const secretaryPayload = { ...payload, chat_id: activeChatId, text: secretaryFormatted };
            tgRes = await fetch(
              `https://api.telegram.org/bot${fallback.token}/sendMessage`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(secretaryPayload) },
            );
            tgData = await tgRes.json();
            // Секретарь отправил → integration_id больше не актуален.
            const fallbackDetail = `employee_bot_send_failed: ${splitErrorDescription}; reply=${body.reply_to_telegram_message_id ?? "no"}; via=split-text`;
            await serviceClient
              .from("project_messages")
              .update({ telegram_bot_integration_id: null, telegram_error_detail: fallbackDetail })
              .eq("id", body.message_id);
          }

          if (tgData.ok && tgData.result?.message_id) {
            await serviceClient
              .from("project_messages")
              .update({ telegram_message_id: tgData.result.message_id, telegram_chat_id: activeChatId })
              .eq("id", body.message_id);
          }

          attachmentsOk = await sendAttachmentsWithFallback({
            messageId: body.message_id,
            chatId: activeChatId,
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
