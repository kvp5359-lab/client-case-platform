/**
 * Edge Function: waha-react — отправка/снятие реакции в WhatsApp через WAHA.
 *
 * Вызывается фронтом (reactionStrategies) после записи в нашу БД.
 * emoji="" (пустой) — снять реакцию. WAHA: PUT /api/reaction.
 *
 * Авторизация: пользовательский JWT (verify_jwt=true).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/+$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!WAHA_URL || !WAHA_API_KEY) return json({ error: "WAHA не настроен" }, 500);

  let body: { message_id?: string; emoji?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { message_id, emoji } = body;
  if (!message_id) return json({ error: "message_id required" }, 400);

  const service = svc();

  const { data: msg } = await service.from("project_messages")
    .select("waha_message_id, thread_id").eq("id", message_id).maybeSingle();
  if (!msg?.waha_message_id) return json({ ok: false, skipped: "no_waha_message_id" }, 200);

  const { data: thread } = await service.from("project_threads")
    .select("waha_session_id").eq("id", msg.thread_id as string).maybeSingle();
  if (!thread?.waha_session_id) return json({ ok: false, skipped: "no_binding" }, 200);

  const { data: session } = await service.from("waha_sessions")
    .select("session_name").eq("id", thread.waha_session_id as string).maybeSingle();
  if (!session?.session_name) return json({ ok: false, skipped: "no_session" }, 200);

  const res = await fetch(`${WAHA_URL}/api/reaction`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
    body: JSON.stringify({
      session: session.session_name,
      messageId: msg.waha_message_id,
      reaction: emoji ?? "",
    }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return json({ ok: false, error: (d as { message?: string })?.message ?? `WAHA ${res.status}` }, 200);
  }
  return json({ ok: true });
});
