/**
 * Edge Function: waha-send — отправка исходящих WhatsApp через self-hosted WAHA.
 *
 * Вызывается триггером dispatch_message_to_channels (ветка WAHA) через
 * dispatch_send_http с заголовком x-internal-secret.
 *
 * MVP: текст + reply. Вложения (attachments_only) — на этапе шлифовки.
 * Деплой: --no-verify-jwt (внутренний вызов, авторизация по x-internal-secret).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { stripHtmlBasic } from "../_shared/channelText.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/+$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function markSent(service: SupabaseClient, id: string, wahaMessageId: string | null) {
  await service.from("project_messages").update({
    send_status: "sent",
    send_failed_reason: null,
    waha_message_id: wahaMessageId ?? undefined,
    waha_status: "sent",
  }).eq("id", id);
}
async function markFailed(service: SupabaseClient, id: string, reason: string) {
  await service.from("project_messages").update({
    send_status: "failed",
    send_failed_reason: reason.slice(0, 500),
  }).eq("id", id);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // Авторизация: только внутренний вызов (триггер)
  if (!INTERNAL_FUNCTION_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_FUNCTION_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { message_id?: string; attachments_only?: boolean };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400 }); }
  const messageId = body.message_id;
  if (!messageId) return new Response(JSON.stringify({ error: "Missing field: message_id" }), { status: 400 });

  const service = svc();

  // Сообщение
  const { data: msg } = await service.from("project_messages")
    .select("id, thread_id, content, reply_to_message_id, visibility, has_attachments")
    .eq("id", messageId).maybeSingle();
  if (!msg) return new Response(JSON.stringify({ error: "message not found" }), { status: 404 });

  // Backstop видимости (defense-in-depth, зеркало триггера): внутреннее наружу не шлём
  if (msg.visibility && msg.visibility !== "client") {
    await markSent(service, messageId, null);
    return new Response(JSON.stringify({ ok: true, skipped: "internal_visibility" }), { status: 200 });
  }

  // Вложения — этап шлифовки. Пока только текст.
  if (body.attachments_only) {
    await markSent(service, messageId, null);
    return new Response(JSON.stringify({ ok: true, skipped: "attachments_todo" }), { status: 200 });
  }

  // Тред → сессия + чат
  const { data: thread } = await service.from("project_threads")
    .select("waha_session_id, waha_chat_id")
    .eq("id", msg.thread_id as string).maybeSingle();
  if (!thread?.waha_session_id || !thread?.waha_chat_id) {
    await markFailed(service, messageId, "waha thread binding missing");
    return new Response(JSON.stringify({ error: "no waha binding" }), { status: 400 });
  }

  const { data: session } = await service.from("waha_sessions")
    .select("session_name, status").eq("id", thread.waha_session_id as string).maybeSingle();
  if (!session?.session_name) {
    await markFailed(service, messageId, "waha session missing");
    return new Response(JSON.stringify({ error: "no session" }), { status: 400 });
  }

  // Reply → внешний waha_message_id оригинала
  let replyTo: string | null = null;
  if (msg.reply_to_message_id) {
    const { data: orig } = await service.from("project_messages")
      .select("waha_message_id").eq("id", msg.reply_to_message_id as string).maybeSingle();
    replyTo = orig?.waha_message_id ?? null;
  }

  // Отправка через WAHA
  if (!WAHA_URL || !WAHA_API_KEY) {
    await markFailed(service, messageId, "WAHA_URL/API_KEY not configured");
    return new Response(JSON.stringify({ error: "waha not configured" }), { status: 500 });
  }

  const text = stripHtmlBasic(msg.content ?? "");
  if (!text.trim()) {
    await markSent(service, messageId, null);
    return new Response(JSON.stringify({ ok: true, skipped: "empty" }), { status: 200 });
  }
  const sendBody: Record<string, unknown> = {
    session: session.session_name,
    chatId: thread.waha_chat_id,
    text,
  };
  if (replyTo) sendBody.reply_to = replyTo;

  try {
    const res = await fetch(`${WAHA_URL}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify(sendBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = typeof data?.message === "string" ? data.message : `WAHA ${res.status}`;
      await markFailed(service, messageId, reason);
      return new Response(JSON.stringify({ error: reason }), { status: 502 });
    }
    // id отправленного сообщения (для reply/дедупа echo)
    const wahaId: string | null =
      (typeof data?.id === "string" ? data.id : null) ??
      (typeof data?.id?._serialized === "string" ? data.id._serialized : null) ??
      (typeof data?.key?.id === "string" ? data.key.id : null);
    await markSent(service, messageId, wahaId);
    return new Response(JSON.stringify({ ok: true, waha_message_id: wahaId }), { status: 200 });
  } catch (err) {
    await markFailed(service, messageId, `waha send error: ${err}`);
    return new Response(JSON.stringify({ error: String(err) }), { status: 502 });
  }
});
