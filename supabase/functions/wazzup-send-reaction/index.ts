/**
 * Edge Function: wazzup-send-reaction
 *
 * Эмулирует реакцию на сообщение в WhatsApp через обычное сообщение-реплай
 * с эмодзи. Wazzup/WhatsApp Bot API не поддерживают native-реакции (как у
 * Telegram), но сам Wazzup в обратную сторону уже делает именно так:
 * реакция клиента приходит к нам как обычное сообщение с эмодзи.
 *
 * Workflow:
 *  1. По нашему message_id находим wazzup_message_id и thread.
 *  2. POST /v3/message в Wazzup с text=emoji + quotedMessageId.
 *
 * Auth: verify_jwt=true — сама Supabase проверяет токен пользователя.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { preflight, jsonRes, getServiceClient } from "../_shared/edge.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);

  let body: { message_id?: string; emoji?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }
  if (!body.message_id || !body.emoji) return jsonRes({ error: "message_id and emoji required" }, 400);

  const service = getServiceClient();

  // 1. Сообщение и его wazzup_message_id
  const { data: msg } = await service
    .from("project_messages")
    .select("id, thread_id, wazzup_message_id, content")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) return jsonRes({ skip: "no message" }, 200);
  if (!msg.wazzup_message_id) return jsonRes({ skip: "not a wazzup message" }, 200);

  // Fallback-цитата в текст: Wazzup quotedMessageId не работает для исходящих,
  // поэтому добавляем «> текст оригинала\nэмодзи». Без этого клиент видит просто
  // эмодзи и не понимает, к чему оно относится.
  const origText = stripHtml((msg.content as string) ?? "");
  const truncated = origText.length > 200 ? origText.slice(0, 200) + "…" : origText;
  const reactionText = truncated ? `> ${truncated}\n${body.emoji}` : body.emoji;

  // 2. Тред
  const { data: thread } = await service
    .from("project_threads")
    .select("wazzup_channel_id, wazzup_chat_id, wazzup_chat_type")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread || !thread.wazzup_channel_id || !thread.wazzup_chat_id) {
    return jsonRes({ skip: "not a wazzup thread" }, 200);
  }

  // 3. Канал + ключ
  const { data: channel } = await service
    .from("wazzup_channels")
    .select("channel_id, transport, workspace_id, is_active")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel?.is_active) return jsonRes({ skip: "channel disabled" }, 200);

  const { data: settings } = await service
    .from("wazzup_settings")
    .select("api_key")
    .eq("workspace_id", channel.workspace_id)
    .maybeSingle();
  if (!settings?.api_key) return jsonRes({ skip: "no api key" }, 200);

  // 4. Шлём reply-эмодзи
  const res = await fetch("https://api.wazzup24.com/v3/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.api_key}`,
    },
    body: JSON.stringify({
      channelId: channel.channel_id,
      chatType: thread.wazzup_chat_type ?? channel.transport ?? "whatsapp",
      chatId: thread.wazzup_chat_id,
      text: reactionText,
      quotedMessageId: msg.wazzup_message_id,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonRes(
      { error: "wazzup api error", status: res.status, body: text.slice(0, 500) },
      502,
    );
  }

  const json = await res.json().catch(() => ({}));
  const sentMessageId = (json as { messageId?: string }).messageId;

  // Записываем в dedup-таблицу, чтобы webhook (когда придёт isEcho=true на это
  // же сообщение) не создал в треде дубль-баббл с эмодзи. Реакция уже
  // отображается у нас как обычная реакция под бабблом.
  if (sentMessageId) {
    await service
      .from("wazzup_outgoing_dedup")
      .insert({ wazzup_message_id: sentMessageId, reason: "reaction" });
  }

  return jsonRes({ ok: true, wazzup_message_id: sentMessageId }, 200);
});

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
