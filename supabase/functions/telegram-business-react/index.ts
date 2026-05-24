/**
 * Edge Function: telegram-business-react
 *
 * Workaround для реакций в Telegram Business — Telegram Bot API не поддерживает
 * setMessageReaction для business_connection_id (см. обсуждение в
 * .claude/rules/infrastructure.md). Поэтому реакцию сотрудника на личное
 * сообщение клиента отправляем как обычное **сообщение-реплай с эмодзи**.
 *
 * Логика toggle (как в RPC toggle_message_reaction, но с TG-стороной):
 *  - Есть текущая реакция этого participant на это сообщение?
 *    - Совпадает по эмодзи — это «снять реакцию»: удаляем строку в БД +
 *      deleteMessage в TG.
 *    - Отличается — «сменить эмодзи»: удаляем старый эмодзи-реплай в TG,
 *      вставляем новую строку, шлём новый эмодзи-реплай.
 *  - Реакции нет — «поставить»: шлём эмодзи-реплай, вставляем строку.
 *
 * Auth: JWT обычного пользователя.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";

interface RequestBody {
  message_id: string; // UUID нашего project_messages
  participant_id: string;
  emoji: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUSINESS_BOT_TOKEN = Deno.env.get("TELEGRAM_BUSINESS_BOT_TOKEN")!;

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  // Auth
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.message_id || !body.participant_id || !body.emoji) {
    return jsonResponse({ error: "message_id, participant_id, emoji required" }, 400, corsHeaders);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Сообщение → тред → business_connection.
  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, telegram_message_id, telegram_chat_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonResponse({ error: "Message not found" }, 404, corsHeaders);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("id, business_connection_id, business_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.business_connection_id || !thread.business_client_tg_user_id) {
    return jsonResponse({ error: "Not a business thread" }, 400, corsHeaders);
  }

  const { data: conn } = await service
    .from("telegram_business_connections")
    .select("business_connection_id, is_enabled, can_reply, workspace_id")
    .eq("id", thread.business_connection_id)
    .maybeSingle();
  if (!conn || conn.workspace_id !== msg.workspace_id) {
    return jsonResponse({ error: "Connection not found" }, 404, corsHeaders);
  }

  // Проверка членства юзера в воркспейсе.
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", msg.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!participant || participant.id !== body.participant_id) {
    return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
  }

  // 2. Текущая реакция этого participant на это сообщение (если есть).
  const { data: existing } = await service
    .from("message_reactions")
    .select("id, emoji, tg_emoji_message_id")
    .eq("message_id", body.message_id)
    .eq("participant_id", body.participant_id)
    .maybeSingle();

  // 3. Toggle-логика.
  // 3a. Есть та же реакция → снять (delete row + deleteMessage в TG).
  if (existing && existing.emoji === body.emoji) {
    await deleteEmojiReply(
      conn.business_connection_id as string,
      thread.business_client_tg_user_id as number,
      existing.tg_emoji_message_id as number | null,
    );
    await service.from("message_reactions").delete().eq("id", existing.id);
    return jsonResponse({ added: false }, 200, corsHeaders);
  }

  // 3b. Если есть реакция с другим эмодзи — удаляем её эмодзи-реплай и строку.
  if (existing) {
    await deleteEmojiReply(
      conn.business_connection_id as string,
      thread.business_client_tg_user_id as number,
      existing.tg_emoji_message_id as number | null,
    );
    await service.from("message_reactions").delete().eq("id", existing.id);
  }

  // 3c. Шлём новый эмодзи-реплай в TG (если can_reply разрешён).
  let tgEmojiMessageId: number | null = null;
  if (conn.is_enabled && conn.can_reply && msg.telegram_message_id) {
    tgEmojiMessageId = await sendEmojiReply(
      conn.business_connection_id as string,
      thread.business_client_tg_user_id as number,
      msg.telegram_message_id as number,
      body.emoji,
    );
  }

  // 3d. Вставляем новую строку в message_reactions.
  await service.from("message_reactions").insert({
    message_id: body.message_id,
    participant_id: body.participant_id,
    emoji: body.emoji,
    tg_emoji_message_id: tgEmojiMessageId,
  });

  return jsonResponse({ added: true, tg_emoji_message_id: tgEmojiMessageId }, 200, corsHeaders);
});

async function sendEmojiReply(
  businessConnectionId: string,
  chatId: number,
  replyToMessageId: number,
  emoji: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_connection_id: businessConnectionId,
          chat_id: chatId,
          text: emoji,
          reply_parameters: {
            message_id: replyToMessageId,
            allow_sending_without_reply: true,
          },
        }),
      },
    );
    const json = (await res.json()) as { ok: boolean; result?: { message_id: number } };
    return json.ok ? json.result?.message_id ?? null : null;
  } catch (err) {
    console.error("[telegram-business-react] sendEmojiReply error:", err);
    return null;
  }
}

async function deleteEmojiReply(
  businessConnectionId: string,
  _chatId: number,
  tgEmojiMessageId: number | null,
): Promise<void> {
  if (!tgEmojiMessageId) return;
  try {
    // Bot API 7.5+: deleteBusinessMessages принимает business_connection_id +
    // массив message_ids. Это правильный способ удалять business-сообщения.
    await fetch(
      `https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/deleteBusinessMessages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_connection_id: businessConnectionId,
          message_ids: [tgEmojiMessageId],
        }),
      },
    );
  } catch (err) {
    console.error("[telegram-business-react] deleteEmojiReply error:", err);
  }
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
