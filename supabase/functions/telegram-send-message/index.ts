/**
 * Edge Function: telegram-send-message
 * Отправка сообщений из ЛК в Telegram-группу
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { safeJsonParse, findMissingField, isValidUUID } from "../_shared/validation.ts";
import { htmlToTelegramHtml, escapeHtmlEntities, isHtmlContent } from "../_shared/htmlFormatting.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken, findEmployeeBot, ERR_NO_SECRETARY_IN_GROUP, isBotNotInChatError, rebindSecretaryInGroup } from "../_shared/telegramBotToken.ts";
import { detectChatMigration } from "../_shared/telegramMigration.ts";
import { isReplyNotFoundError, loadReplyQuoteHtml } from "./helpers.ts";
import { sendAttachmentsWithFallback } from "./attachments.ts";
import { markMessageSent, markMessageFailed } from "../_shared/messageSendStatus.ts";

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
  const corsHeaders = corsHeadersFor(req);

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
      attachments_only_raw_type: typeof body.attachments_only,
      content_len: body.content?.length ?? 0,
      content_preview: typeof body.content === "string" ? body.content.slice(0, 80) : null,
      content_is_paperclip: body.content === "📎",
      sender_name: body.sender_name,
      has_reply_to: !!body.reply_to_telegram_message_id,
    });

    // Флаг, который выставляется в местах markMessageSent / markMessageFailed.
    // Если в конце функции остался false — значит мы прошли все ветки и не
    // выставили send_status. Это баг (сообщение застрянет в pending), и нам
    // нужно увидеть его в логах + в БД отдельным trace-event'ом.
    let statusWritten = false;

    /**
     * Попытка резолвить токен секретаря для fallback после fail личного бота.
     * Если resolveBotToken бросает с маркером NO_SECRETARY_IN_GROUP — это
     * означает что в группе нет ни одного нашего бота-секретаря. Делаем
     * markMessageFailed с понятным reason и возвращаем null (вызывающий
     * должен прервать fallback). Прочие ошибки пробрасываем в общий catch.
     */
    const tryFallbackToSecretary = async (
      activeChatId: number,
      stage: string,
      employeeError: string,
    ) => {
      try {
        return await resolveBotToken(serviceClient, activeChatId);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (errMsg.includes(ERR_NO_SECRETARY_IN_GROUP)) {
          await markMessageFailed(
            serviceClient,
            body.message_id,
            "Личный бот не справился, а бота-секретаря в этой группе нет. Добавьте секретаря в группу или отправьте через другой канал.",
            {
              failureSource: "telegram",
              failureCode: "no_secretary_in_group",
              failureMetadata: { stage, chat_id: activeChatId, employee_error: employeeError },
            },
          );
          statusWritten = true;
          return null;
        }
        throw e;
      }
    };

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

    const isAttachmentsOnlyContent = body.content === "📎";
    const wantTextOnly = !body.attachments_only && !isAttachmentsOnlyContent;
    trace("branch.decision", {
      wantTextOnly,
      attachments_only: body.attachments_only ?? false,
      isAttachmentsOnlyContent,
      will_enter_text_branch: wantTextOnly,
      will_enter_attachments_branch: !!(body.attachments_only && body.message_id),
      will_skip_both_branches:
        !wantTextOnly && !(body.attachments_only && body.message_id),
    });

    // Резолв бота: сначала пробуем личный бот сотрудника-отправителя; если
    // его нет — fallback на бота-секретаря (resolveBotToken).
    // Личный бот = настоящая аватарка/имя в Telegram → префикс "(Имя):" не нужен.
    let senderParticipantId: string | null = null;
    {
      const { data: msgRow } = await serviceClient
        .from("project_messages")
        .select("sender_participant_id, visibility")
        .eq("id", body.message_id)
        .maybeSingle();
      senderParticipantId = (msgRow?.sender_participant_id as string | null) ?? null;

      // 🔒 Backstop: НЕ отправляем в Telegram внутренние сообщения (team/self/
      // «Заметка»). Фронт уже гейтит внешнюю доставку по visibility, это защита
      // на уровне канала — утечка внутреннего сообщения клиенту критична
      // (баг 2026-07-08: внутреннее сообщение с файлом ушло клиенту в группу).
      const visibility = (msgRow?.visibility as string | null) ?? "client";
      if (visibility !== "client") {
        await markMessageSent(serviceClient, body.message_id, { channelFields: {} });
        return new Response(
          JSON.stringify({ ok: true, skipped: "internal_visibility" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
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

    // Reply в multi-bot группе: message_id цели ДЛЯ ОТПРАВЛЯЮЩЕГО бота (у каждого
    // бота свой) — из карты telegram_bot_msg_ids цели. Нет своего id (сообщение
    // до карты) → сохранённый id (может не совпасть → fallback «висячего» reply у
    // текста; у вложений reply просто не прикрепится). Общий хелпер для текста и
    // вложений.
    const resolveReplyIdForSendingBot = async (
      storedReplyMsgId: number,
      chatId: number,
    ): Promise<number> => {
      const sendingBotKey = isEmployeeBot ? (resolved.integrationId ?? null) : "secretary";
      if (!sendingBotKey) return storedReplyMsgId;
      const { data: targetRow } = await serviceClient
        .from("project_messages")
        .select("telegram_bot_msg_ids")
        .eq("telegram_chat_id", chatId)
        .eq("telegram_message_id", storedReplyMsgId)
        .maybeSingle();
      const botMsgIds =
        (targetRow?.telegram_bot_msg_ids as Record<string, number> | null) ?? {};
      return botMsgIds[sendingBotKey] ?? storedReplyMsgId;
    };

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
        .eq("id", body.message_id)
        .throwOnError();
    }

    if (authenticatedUserId) {
      // Резолвим воркспейс: по проекту (если есть) ИЛИ из самого сообщения —
      // групповые чаты уровня воркспейса не привязаны к проекту (project_id=NULL),
      // тогда project_id в body отсутствует. Раньше это давало 403 и вложения в
      // такие чаты не отправлялись (текст уходил триггером мимо этой проверки).
      let accessWorkspaceId: string | null = null;
      if (body.project_id && isValidUUID(body.project_id)) {
        const { data: project } = await serviceClient
          .from("projects")
          .select("workspace_id")
          .eq("id", body.project_id)
          .maybeSingle();
        accessWorkspaceId = project?.workspace_id ?? null;
      } else if (body.message_id && isValidUUID(body.message_id)) {
        const { data: msgRow } = await serviceClient
          .from("project_messages")
          .select("workspace_id")
          .eq("id", body.message_id)
          .maybeSingle();
        accessWorkspaceId = (msgRow as { workspace_id: string | null } | null)?.workspace_id ?? null;
      }

      if (!accessWorkspaceId) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const isMember = await checkWorkspaceMembership(serviceClient, authenticatedUserId, accessWorkspaceId);
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

    // Общая цепочка отправки текста с фоллбэками: send → ретрай при миграции
    // группы → fallback «висячего» reply → fallback личный→секретарь. Возвращает
    // финальный tgData + контекст, ЛИБО сигнал no_secretary (вызывающий вернёт
    // 200, чтобы watchdog не перетёр reason). Пост-обработка статуса (markSent /
    // отложенный апдейт telegram_message_id) у текстовой и split-text веток
    // разная — поэтому остаётся в вызывающем коде. Раньше эта цепочка была
    // скопирована дважды (text + split-text) — рассинхрон копий породил баг
    // 2026-05-28. Вся диагностика (telegram_error_detail на каждом шаге)
    // сохранена дословно, через параметр `via`.
    type SendChainResult =
      | { kind: "no_secretary" }
      | {
          kind: "done";
          tgData: { ok: boolean; result?: { message_id?: number; date?: number }; description?: string; error_code?: number };
          tgStatus: number;
          activeChatId: number;
          activeIntegrationId: string | null;
          activeToken: string;
        };
    const sendTextWithFallbacks = async (opts: {
      initialChatId: number;
      /** Текст основной отправки (личным ботом). Используется и для реконструкции reply-цитаты. */
      formattedText: string;
      /** Текст для отправки секретарём — всегда с префиксом «Имя:» (у секретаря своя личность). */
      secretaryFormattedText: string;
      via: "text" | "split-text";
      stage: "text" | "split_text";
    }): Promise<SendChainResult> => {
      let activeChatId = opts.initialChatId;
      const payload: Record<string, unknown> = {
        chat_id: activeChatId,
        text: opts.formattedText,
        parse_mode: "HTML",
      };
      // Reply: message_id цели для отправляющего бота (см. resolveReplyIdForSendingBot).
      if (body.reply_to_telegram_message_id != null) {
        const replyId = await resolveReplyIdForSendingBot(
          body.reply_to_telegram_message_id,
          activeChatId,
        );
        payload.reply_parameters = { message_id: replyId };
      }

      let tgResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      let tgData = await tgResponse.json();
      let activeToken = TELEGRAM_BOT_TOKEN;
      let activeIntegrationId = resolved.integrationId;

      // Апгрейд группы → супергруппы: при migrate_to_chat_id повторяем тем же
      // ботом с новым chat_id. Только потом — fallback на секретаря.
      const migratedChatId = await detectChatMigration(serviceClient, activeChatId, tgData);
      if (migratedChatId !== null) {
        activeChatId = migratedChatId;
        payload.chat_id = migratedChatId;
        tgResponse = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        );
        tgData = await tgResponse.json();
      }

      // Fallback «висячего» reply: reply_parameters указывает на исчезнувшее
      // сообщение (типично после миграции в супергруппу). Шлём тем же ботом без
      // reply_parameters, с blockquote-цитатой оригинала в начале.
      if (!tgData.ok && isReplyNotFoundError(tgData) && payload.reply_parameters) {
        const quote = await loadReplyQuoteHtml(serviceClient, body.message_id);
        delete payload.reply_parameters;
        if (quote) {
          payload.text = `${quote}\n${opts.formattedText}`;
        }
        tgResponse = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        );
        tgData = await tgResponse.json();
        if (tgData.ok) {
          await serviceClient
            .from("project_messages")
            .update({
              telegram_error_detail: `reply_dropped: original message_id=${body.reply_to_telegram_message_id} not in chat (likely supergroup migration); via=${opts.via}`,
            })
            .eq("id", body.message_id)
            .throwOnError();
        }
      }

      // Fallback личный→секретарь: личный бот не смог отправить (например, его
      // нет в группе — "bot is not a member of the group chat"). Переотправляем
      // секретарём с префиксом «Имя:». Диагностику сохраняем.
      if (!tgData.ok && isEmployeeBot) {
        const employeeErrorDescription = tgData.description ?? "unknown";
        const employeeErrorCode = tgData.error_code;
        console.warn(
          `[telegram-send-message] ${opts.via === "split-text" ? "split-text " : ""}employee bot send failed, falling back to secretary:`,
          employeeErrorDescription,
        );
        // Сохраняем причину СРАЗУ — до попытки fallback'а на секретаря (если
        // resolveBotToken упадёт, причина personal bot останется видна в БД).
        await serviceClient
          .from("project_messages")
          .update({
            telegram_error_detail:
              `employee_bot_error: "${employeeErrorDescription}" ` +
              `(code=${employeeErrorCode ?? "n/a"}); reply=${body.reply_to_telegram_message_id ?? "no"}; ` +
              `via=${opts.via}; awaiting_fallback`,
          })
          .eq("id", body.message_id);
        const fallback = await tryFallbackToSecretary(
          activeChatId,
          opts.stage,
          employeeErrorDescription,
        );
        if (!fallback) {
          // markMessageFailed уже вызван внутри tryFallbackToSecretary.
          trace("request.end.no_secretary", { stage: opts.stage });
          return { kind: "no_secretary" };
        }
        const secretaryPayload = { ...payload, chat_id: activeChatId, text: opts.secretaryFormattedText };
        // reply_parameters.message_id — id в нумерации личного бота, секретарю
        // он неизвестен. Сбрасываем reply и вставляем blockquote-цитату.
        if (secretaryPayload.reply_parameters) {
          delete secretaryPayload.reply_parameters;
          const quote = await loadReplyQuoteHtml(serviceClient, body.message_id);
          if (quote) secretaryPayload.text = `${quote}\n${opts.secretaryFormattedText}`;
        }
        tgResponse = await fetch(
          `https://api.telegram.org/bot${fallback.token}/sendMessage`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(secretaryPayload) },
        );
        tgData = await tgResponse.json();
        activeToken = fallback.token;
        // Секретарь отправил → integration_id личного бота больше не актуален,
        // снимаем стамп, чтобы edit/delete/reaction роутились по секретарю.
        activeIntegrationId = null;
        const fallbackDetail = `employee_bot_send_failed: ${employeeErrorDescription}; reply=${body.reply_to_telegram_message_id ?? "no"}; via=${opts.via}`;
        await serviceClient
          .from("project_messages")
          .update({ telegram_bot_integration_id: null, telegram_error_detail: fallbackDetail })
          .eq("id", body.message_id)
          .throwOnError();
      }

      // Self-heal привязки секретаря: отправка провалилась с «бот не в группе»
      // (кикнули секретаря / привязка протухла на другого бота). Ищем ДРУГОГО
      // живого секретаря воркспейса в этой группе, переписываем привязку и
      // повторяем ОДИН раз. Дополняет DB-level self-heal в resolveBotToken
      // (тот лечит только NULL/мёртвую интеграцию, но не кикнутого бота).
      if (!tgData.ok && isBotNotInChatError(tgData.description)) {
        const rebind = await rebindSecretaryInGroup(serviceClient, activeChatId);
        if (rebind) {
          const healPayload: Record<string, unknown> = {
            ...payload,
            chat_id: activeChatId,
            text: opts.secretaryFormattedText,
          };
          // reply_parameters завязан на нумерацию прежнего бота — новому боту он
          // неизвестен. Сбрасываем и вставляем blockquote-цитату оригинала.
          if (healPayload.reply_parameters) {
            delete healPayload.reply_parameters;
            const quote = await loadReplyQuoteHtml(serviceClient, body.message_id);
            if (quote) healPayload.text = `${quote}\n${opts.secretaryFormattedText}`;
          }
          tgResponse = await fetch(
            `https://api.telegram.org/bot${rebind.token}/sendMessage`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(healPayload) },
          );
          tgData = await tgResponse.json();
          activeToken = rebind.token;
          // Отправлено новым секретарём → стамп прежнего бота не актуален.
          activeIntegrationId = null;
          await serviceClient
            .from("project_messages")
            .update({
              telegram_bot_integration_id: null,
              telegram_error_detail: `secretary_rebind: healed binding to ${rebind.integrationId}; via=${opts.via}`,
            })
            .eq("id", body.message_id);
        }
      }

      return {
        kind: "done",
        tgData,
        tgStatus: tgResponse.status,
        activeChatId,
        activeIntegrationId,
        activeToken,
      };
    };

    if (wantTextOnly) {
      const contentForTelegram = isHtmlContent(body.content)
        ? htmlToTelegramHtml(body.content)
        : escapeHtmlEntities(body.content);
      const formattedText = showSenderName
        ? `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`
        : contentForTelegram;
      const secretaryFormatted = `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`;

      const sent = await sendTextWithFallbacks({
        initialChatId: body.telegram_chat_id,
        formattedText,
        secretaryFormattedText: secretaryFormatted,
        via: "text",
        stage: "text",
      });
      if (sent.kind === "no_secretary") {
        // Возвращаем 200, чтобы watchdog не перетёр reason на свой "HTTP 500".
        return new Response(
          JSON.stringify({ ok: true, fallback_failed: "no_secretary" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { tgData, tgStatus, activeChatId, activeIntegrationId, activeToken } = sent;

      if (tgData.ok && tgData.result?.message_id) {
        trace("tg.send.ok.before_markSent", {
          tg_message_id: tgData.result.message_id,
          active_chat_id: activeChatId,
          active_integration_id: activeIntegrationId,
        });
        // Диагностика баг-кейса 2026-05-28 (23505 на uq_telegram_message_per_chat):
        // ЗАПИСЫВАЕМ candidate (chat, msg_id) В telegram_error_detail ДО markMessageSent.
        // Если markMessageSent потом упадёт на 23505 — у нас в БД будет видно
        // КАКОЙ msg_id пытались записать. Сравнив с уже занятым в этом чате,
        // увидим: совпадает с предыдущим сообщением того же бота? Полностью
        // случайный? Это ключевая зацепка для поиска корня (state leak vs TG bug).
        try {
          await serviceClient
            .from("project_messages")
            .update({
              telegram_error_detail:
                `candidate_markSent: tg_msg_id=${tgData.result.message_id}, ` +
                `chat=${activeChatId}, integration=${activeIntegrationId ?? 'null'}, ` +
                `trace=${TRACE_ID}, elapsed_ms=${Date.now() - T0}, ` +
                `tg_date=${tgData.result.date ?? 'n/a'}`,
            })
            .eq("id", body.message_id);
        } catch (diagErr) {
          console.warn("[telegram-send] candidate diag write failed:", diagErr);
        }
        try {
          await markMessageSent(serviceClient, body.message_id, {
            channelFields: {
              telegram_message_id: tgData.result.message_id,
              telegram_chat_id: activeChatId,
              telegram_message_date: tgData.result.date
                ? new Date(tgData.result.date * 1000).toISOString()
                : null,
            },
          });
          statusWritten = true;
          trace("tg.send.ok.markSent_done");
        } catch (markErr) {
          // markMessageSent падает редко (RLS / триггеры), но если упал —
          // сообщение УЖЕ отправлено в Telegram. Возвращаем 200 с warning,
          // чтобы не дёргать watchdog (он пометит failed) и не давать клиенту
          // повторить (создав дубль). Триггер на send_status сам разрулит.
          const errMsg = markErr instanceof Error ? markErr.message : String(markErr);
          console.error(JSON.stringify({
            trace_id: TRACE_ID,
            event: "markSent.failed",
            message_id: body.message_id,
            tg_message_id: tgData.result.message_id,
            error: errMsg,
            stack: markErr instanceof Error ? markErr.stack : undefined,
          }));
          // Best-effort прямой UPDATE send_status=sent — без триггеров на send_status_change.
          // .select('id') + проверка affected rows: симметрично markMessageSent
          // в _shared/messageSendStatus.ts (см. коммит 3ade916). Если fallback
          // тоже 0 rows — это та же корневая причина (неверный id / RLS), и
          // тихий bypass недопустим. Пробрасываем наверх → outer catch → 500
          // → watchdog переведёт pending в failed.
          const { data: fallbackData, error: fallbackErr } = await serviceClient
            .from("project_messages")
            .update({
              send_status: "sent",
              telegram_message_id: tgData.result.message_id,
              telegram_chat_id: activeChatId,
            })
            .eq("id", body.message_id)
            .select("id");
          if (fallbackErr) {
            throw new Error(
              `markSent fallback UPDATE failed for ${body.message_id}: ${fallbackErr.message} (${fallbackErr.code})`,
            );
          }
          if (!fallbackData || fallbackData.length === 0) {
            throw new Error(
              `markSent fallback UPDATE affected 0 rows for id=${body.message_id} — message not found or RLS denied`,
            );
          }
          statusWritten = true;
          trace("tg.send.ok.markSent_fallback_done");
        }
      } else {
        console.error("Telegram API error:", tgData);
        // Финальный фейл текстовой отправки (после всех retry/fallback) —
        // переводим сообщение в failed и пишем в message_send_failures
        // (для глобального тоста у юзера, который ушёл из треда).
        await markMessageFailed(
          serviceClient,
          body.message_id,
          tgData.description ?? `Telegram API: ${tgStatus}`,
          {
            failureSource: "telegram",
            failureCode: tgData.error_code != null
              ? `tg_${tgData.error_code}`
              : `http_${tgStatus}`,
            integrationId: activeIntegrationId ?? null,
            failureMetadata: { stage: "text", chat_id: activeChatId },
          },
        );
        statusWritten = true;
      }

      // (только для устранения unused-warn'ов)
      void activeToken;
      void activeIntegrationId;
    }

    if (body.attachments_only && body.message_id) {
      const hasText = body.content && body.content !== "\ud83d\udcce";
      let attachmentsOk = false;
      // Reply \u0441 \u0444\u0430\u0439\u043b\u043e\u043c: message_id \u0446\u0435\u043b\u0438 \u0434\u043b\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0449\u0435\u0433\u043e \u0431\u043e\u0442\u0430 (\u0442\u0430 \u0436\u0435 \u043a\u0430\u0440\u0442\u0430, \u0447\u0442\u043e
      // \u0443 \u0442\u0435\u043a\u0441\u0442\u0430). \u041d\u0435\u0442 \u0441\u0432\u043e\u0435\u0433\u043e id \u2192 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0439 (reply \u043f\u0440\u043e\u0441\u0442\u043e \u043d\u0435 \u043f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u0441\u044f).
      // Фронт-invoke вложений НЕ передаёт reply_to_telegram_message_id (в отличие
      // от текста, который идёт триггером с уже разрешённой целью). Поэтому цель
      // reply резолвим здесь из самого сообщения: его reply_to_message_id →
      // telegram_message_id оригинала. Затем — id цели для отправляющего бота (карта).
      let storedReplyTelegramId: number | null = body.reply_to_telegram_message_id ?? null;
      if (storedReplyTelegramId == null) {
        const { data: selfRow } = await serviceClient
          .from("project_messages")
          .select("reply_to_message_id")
          .eq("id", body.message_id)
          .maybeSingle();
        const replyToDbId = selfRow?.reply_to_message_id as string | null | undefined;
        if (replyToDbId) {
          const { data: targetRow } = await serviceClient
            .from("project_messages")
            .select("telegram_message_id")
            .eq("id", replyToDbId)
            .eq("telegram_chat_id", body.telegram_chat_id)
            .maybeSingle();
          storedReplyTelegramId =
            (targetRow?.telegram_message_id as number | null | undefined) ?? null;
        }
      }
      const attachmentReplyTo =
        storedReplyTelegramId != null
          ? await resolveReplyIdForSendingBot(storedReplyTelegramId, body.telegram_chat_id)
          : undefined;

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

        // Combined-режим (caption + альбом одним запросом) допустим только при
        // 1 файле и caption ≤ 1024. Иначе разделяем на отдельный текст + альбом.
        const sendTextAsSeparateMessage =
          formattedCaption.length > 1024 ||
          (attachmentsCount ?? 0) >= 2;

        if (!sendTextAsSeparateMessage) {
          attachmentsOk = await sendAttachmentsWithFallback({
            messageId: body.message_id,
            chatId: body.telegram_chat_id,
            supabaseClient: serviceClient,
            primaryToken: TELEGRAM_BOT_TOKEN,
            caption: formattedCaption,
            replyTo: attachmentReplyTo,
            isEmployeeBot,
            senderName: body.sender_name,
          });
        } else {
          // Split-text: текст отдельным сообщением ПЕРЕД альбомом (2+ файла или
          // caption > 1024). Та же цепочка отправки с фоллбэками, что у текстовой
          // ветки — теперь общий хелпер sendTextWithFallbacks (раньше копия).
          const secretaryFormatted = `<b>${escapeHtmlEntities(body.sender_name || "")}:</b>\n${contentForTelegram}`;
          const sent = await sendTextWithFallbacks({
            initialChatId: body.telegram_chat_id,
            formattedText: formattedCaption,
            secretaryFormattedText: secretaryFormatted,
            via: "split-text",
            stage: "split_text",
          });
          if (sent.kind === "no_secretary") {
            return new Response(
              JSON.stringify({ ok: true, fallback_failed: "no_secretary" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          const { tgData, tgStatus, activeChatId } = sent;

          if (tgData.ok && tgData.result?.message_id) {
            // Текст ушёл — фиксируем message_id. send_status выставим позже,
            // вместе с итогом по attachments (там и решается итоговый статус).
            const { error: textUpdateErr } = await serviceClient
              .from("project_messages")
              .update({
                telegram_message_id: tgData.result.message_id,
                telegram_chat_id: activeChatId,
              })
              .eq("id", body.message_id);
            if (textUpdateErr) {
              throw new Error(
                `split_text update failed: ${textUpdateErr.message} (${textUpdateErr.code})`,
              );
            }
          } else if (!tgData.ok) {
            // Финальный фейл split-text-ветки (caption + альбом). Логируем
            // отдельно от вложений: текст и файлы в этой ветке шлются разными
            // запросами, и пользователю важно знать что именно текст не дошёл.
            await markMessageFailed(
              serviceClient,
              body.message_id,
              tgData.description ?? `Telegram API: ${tgStatus}`,
              {
                failureSource: "telegram",
                failureCode: tgData.error_code != null
                  ? `tg_${tgData.error_code}`
                  : `http_${tgStatus}`,
                failureMetadata: { stage: "split_text", chat_id: activeChatId },
              },
            );
            statusWritten = true;
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
        // Только вложения, без caption.
        attachmentsOk = await sendAttachmentsWithFallback({
          messageId: body.message_id,
          chatId: body.telegram_chat_id,
          supabaseClient: serviceClient,
          primaryToken: TELEGRAM_BOT_TOKEN,
          replyTo: attachmentReplyTo,
          isEmployeeBot,
          senderName: body.sender_name,
        });
      }

      trace("attachments.done", { ok: attachmentsOk });
      if (attachmentsOk) {
        // Текст уже отметился telegram_message_id (если был); финальный send_status='sent'.
        await markMessageSent(serviceClient, body.message_id, {
          channelFields: { telegram_attachments_delivered: true },
        });
        statusWritten = true;
      } else {
        await markMessageFailed(
          serviceClient,
          body.message_id,
          "Не удалось отправить вложения в Telegram",
          {
            channelFields: { telegram_attachments_delivered: false },
            failureSource: "telegram",
            failureCode: "attachments_failed",
            failureMetadata: { stage: "attachments", chat_id: body.telegram_chat_id },
          },
        );
        statusWritten = true;
      }
    }

    // Финальная диагностика: если ни одна ветка не выставила send_status —
    // это баг. Логируем громко (console.error для видимости в Dashboard),
    // плюс пишем в telegram_error_detail на самом сообщении: так post-mortem
    // можно делать SQL'ом, не залезая в Functions Logs.
    if (!statusWritten) {
      console.error(JSON.stringify({
        trace_id: TRACE_ID,
        event: "BUG.no_branch_wrote_status",
        message_id: body.message_id,
        attachments_only: body.attachments_only ?? false,
        attachments_only_raw_type: typeof body.attachments_only,
        content_preview: typeof body.content === "string" ? body.content.slice(0, 80) : null,
        content_is_paperclip: body.content === "📎",
        wantTextOnly,
        body_keys: Object.keys((body ?? {}) as Record<string, unknown>),
      }));
      await serviceClient
        .from("project_messages")
        .update({
          telegram_error_detail:
            `BUG no_branch_wrote_status: attachments_only=${body.attachments_only ?? false} ` +
            `content_paperclip=${body.content === "📎"} wantTextOnly=${wantTextOnly} ` +
            `content_len=${body.content?.length ?? 0}`,
        })
        .eq("id", body.message_id);
    }

    trace("request.end", { total_ms: Date.now() - T0, statusWritten });
    return new Response(
      JSON.stringify({ ok: true, statusWritten }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    // Расширенный лог: stack + сам error JSON.stringify-нутый. В Supabase
    // Dashboard будет видна вся цепочка вызовов.
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error(JSON.stringify({
      event: "telegram-send-message.fatal",
      error: errMsg,
      stack: errStack,
      error_raw: String(error),
    }));
    // Возвращаем КОНКРЕТНУЮ причину в body — watchdog запишет её в
    // message_send_failures.error_text, и в БД сразу будет видно «где упало»
    // без чтения Dashboard-логов.
    return new Response(
      JSON.stringify({ error: "Internal server error", reason: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
