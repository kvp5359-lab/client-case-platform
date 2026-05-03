/**
 * Edge Function: wazzup-send
 *
 * Шлёт исходящее сообщение в Wazzup (WhatsApp / Instagram / etc) через
 * REST API v3. Вызывается pg-триггером notify_telegram_on_new_message,
 * когда у треда заполнен wazzup_channel_id.
 *
 * Auth: x-internal-secret (как у telegram-business-send и telegram-send-message).
 * Деплой: --no-verify-jwt.
 *
 * Workflow:
 *  1. Берём message_id, читаем project_messages → thread_id, content.
 *  2. По thread_id находим project_threads → wazzup_channel_id, wazzup_chat_id.
 *  3. По wazzup_channel_id → wazzup_channels → channel_id (Wazzup UUID), workspace_id.
 *  4. Из wazzup_settings берём api_key.
 *  5. POST https://api.wazzup24.com/v3/message
 *     { channelId, chatType, chatId, text }
 *  6. Стампим wazzup_message_id и wazzup_status='sent' в project_messages.
 *
 * Ограничения MVP: только текст, без вложений, без quotedMessage. Файлы и
 * реакции — отдельной итерацией.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    .select("id, thread_id, content, wazzup_message_id, workspace_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) return jsonOk({ skip: "no thread" });
  if (msg.wazzup_message_id) return jsonOk({ skip: "already sent" });

  // 2. Тред
  const { data: thread } = await service
    .from("project_threads")
    .select("id, wazzup_channel_id, wazzup_chat_id, wazzup_chat_type")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread || !thread.wazzup_channel_id || !thread.wazzup_chat_id) {
    return jsonOk({ skip: "not a wazzup thread" });
  }

  // 3. Канал
  const { data: channel } = await service
    .from("wazzup_channels")
    .select("channel_id, transport, workspace_id, is_active, state")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel) return jsonOk({ skip: "channel not found" });
  if (!channel.is_active) return jsonOk({ skip: "channel disabled in our DB" });

  // 4. API-ключ
  const { data: settings } = await service
    .from("wazzup_settings")
    .select("api_key")
    .eq("workspace_id", channel.workspace_id)
    .maybeSingle();
  if (!settings?.api_key) return jsonOk({ skip: "no api key" });

  // 5. Подготавливаем text. Контент в БД — HTML из tiptap. WhatsApp поддерживает
  // только plain text + базовое markdown-форматирование (*bold*, _italic_, ~strike~).
  // На MVP — отправляем как plain (срезаем HTML-теги). Полный конвертер —
  // отдельной итерацией.
  const text = stripHtml(msg.content || "");
  if (!text.trim()) return jsonOk({ skip: "empty content" });

  // 6. POST в Wazzup
  const wazzupRes = await fetch("https://api.wazzup24.com/v3/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.api_key}`,
    },
    body: JSON.stringify({
      channelId: channel.channel_id,
      chatType: thread.wazzup_chat_type ?? channel.transport ?? "whatsapp",
      chatId: thread.wazzup_chat_id,
      text,
    }),
  });

  const wazzupJson = (await wazzupRes.json().catch(() => ({}))) as {
    messageId?: string;
    error?: string;
    description?: string;
  };

  if (!wazzupRes.ok || !wazzupJson.messageId) {
    const errDesc = wazzupJson.description ?? wazzupJson.error ?? `HTTP ${wazzupRes.status}`;
    console.error(`[wazzup-send] error:`, errDesc, wazzupJson);
    await service
      .from("project_messages")
      .update({ wazzup_status: "error" })
      .eq("id", msg.id);
    return jsonOk({ ok: false, error: errDesc });
  }

  // 7. Стампим, чтобы не отправить повторно (а также чтобы webhook'овый echo
  // распознался как уже наше).
  await service
    .from("project_messages")
    .update({
      wazzup_message_id: wazzupJson.messageId,
      wazzup_status: "sent",
    })
    .eq("id", msg.id);

  return jsonOk({ ok: true, wazzup_message_id: wazzupJson.messageId });
});

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Грубое удаление HTML-тегов и декодирование базовых entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
