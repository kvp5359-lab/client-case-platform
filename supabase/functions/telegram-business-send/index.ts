/**
 * Edge Function: telegram-business-send
 *
 * Шлёт ответ из сервиса в личный чат клиента через Telegram Business —
 * сообщение приходит клиенту от имени сотрудника, не бота. Используется
 * pg-триггером notify_telegram_on_new_message, когда тред business-овский.
 *
 * Auth: триггер шлёт x-internal-secret. JWT не требуется
 * (deploy с --no-verify-jwt).
 *
 * Workflow:
 * 1. Берём message_id, читаем project_messages → thread_id.
 * 2. По thread_id находим project_threads → business_connection_id, business_client_tg_user_id.
 * 3. По business_connection_id находим в telegram_business_connections → активная связь.
 * 4. Вызываем Telegram Bot API: sendMessage с параметром business_connection_id
 *    и chat_id = business_client_tg_user_id.
 * 5. Проставляем telegram_message_id в project_messages.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  isHtmlContent,
  htmlToTelegramHtml,
  escapeHtmlEntities,
} from "../_shared/htmlFormatting.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUSINESS_BOT_TOKEN = Deno.env.get("TELEGRAM_BUSINESS_BOT_TOKEN")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

interface RequestBody {
  message_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const got = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || got !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!body.message_id) {
    return new Response(JSON.stringify({ error: "message_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Сообщение
  const { data: msg } = await service
    .from("project_messages")
    .select("id, thread_id, content, telegram_message_id, reply_to_message_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonOk({ skip: "no thread" });
  }
  if (msg.telegram_message_id) {
    return jsonOk({ skip: "already sent" });
  }

  // Если это reply на сообщение в нашем сервисе — берём telegram_message_id
  // оригинала, чтобы в Telegram пришло как настоящий quoted-reply.
  let replyToTgMsgId: number | null = null;
  if (msg.reply_to_message_id) {
    const { data: replyTarget } = await service
      .from("project_messages")
      .select("telegram_message_id")
      .eq("id", msg.reply_to_message_id)
      .maybeSingle();
    replyToTgMsgId = (replyTarget?.telegram_message_id as number | null) ?? null;
  }

  // 2. Тред с business_connection_id
  const { data: thread } = await service
    .from("project_threads")
    .select("id, business_connection_id, business_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread || !thread.business_connection_id || !thread.business_client_tg_user_id) {
    return jsonOk({ skip: "not a business thread" });
  }

  // 3. Соединение
  const { data: conn } = await service
    .from("telegram_business_connections")
    .select("business_connection_id, is_enabled, can_reply")
    .eq("id", thread.business_connection_id)
    .maybeSingle();
  if (!conn) {
    return jsonOk({ skip: "connection not found" });
  }
  if (!conn.is_enabled) {
    return jsonOk({ skip: "connection disabled" });
  }
  if (!conn.can_reply) {
    return jsonOk({ skip: "no can_reply right" });
  }

  // 4. Telegram API
  // Контент в БД обычно приходит как HTML из tiptap-редактора. Конвертируем
  // в подмножество HTML, поддерживаемое Telegram (b, i, a, code, pre и т.д.),
  // через тот же общий хелпер, что использует обычный telegram-send-message —
  // оформление (жирный, курсив, ссылки) единообразное.
  const text = isHtmlContent(msg.content)
    ? htmlToTelegramHtml(msg.content)
    : escapeHtmlEntities(msg.content);

  // sender_name НЕ добавляем: в Business-режиме сообщение и так уходит от
  // имени сотрудника (через business_connection_id), подпись не нужна.

  const sendPayload: Record<string, unknown> = {
    business_connection_id: conn.business_connection_id,
    chat_id: thread.business_client_tg_user_id,
    text,
    parse_mode: "HTML",
  };
  if (replyToTgMsgId) {
    // reply_parameters — современная форма (Bot API 7.0+). Поле message_id
    // — id сообщения в Telegram, на которое отвечаем. allow_sending_without_reply
    // — если оригинал удалён, всё равно отправить (без цитаты).
    sendPayload.reply_parameters = {
      message_id: replyToTgMsgId,
      allow_sending_without_reply: true,
    };
  }
  const tgRes = await fetch(
    `https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendPayload),
    },
  );
  const tgJson = (await tgRes.json()) as {
    ok: boolean;
    result?: { message_id: number; date: number };
    description?: string;
  };

  if (!tgJson.ok) {
    console.error(`[telegram-business-send] Telegram API error:`, tgJson);
    await service
      .from("project_messages")
      .update({ telegram_error_detail: tgJson.description ?? "send failed" })
      .eq("id", msg.id);
    return jsonOk({ ok: false, error: tgJson.description });
  }

  // 5. Стампим telegram_message_id + telegram_chat_id, чтобы:
  //    - не отправить повторно при ретраях,
  //    - фронт мог отправлять реакции на это сообщение в TG (он берёт
  //      telegram_chat_id из БД и без него скипает запрос к set-reaction).
  await service
    .from("project_messages")
    .update({
      telegram_message_id: tgJson.result?.message_id ?? null,
      telegram_message_ids: tgJson.result?.message_id ? [tgJson.result.message_id] : null,
      telegram_chat_id: thread.business_client_tg_user_id,
      telegram_message_date: tgJson.result?.date
        ? new Date(tgJson.result.date * 1000).toISOString()
        : null,
      telegram_error_detail: null,
    })
    .eq("id", msg.id);

  return jsonOk({ ok: true, telegram_message_id: tgJson.result?.message_id });
});

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
