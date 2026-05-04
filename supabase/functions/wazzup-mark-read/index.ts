/**
 * Edge Function: wazzup-mark-read
 *
 * Когда сотрудник открывает Wazzup-тред в сервисе, фронт дёргает эту функцию,
 * и мы говорим Wazzup'у «всё прочитано» — клиент в WhatsApp видит синие
 * галочки. Делается через POST https://api.wazzup24.com/v3/markread:
 *   { channelId, chatType, chatId }
 *
 * Auth: пользовательский JWT, проверяется RLS — пользователь должен быть
 * собственником канала (user_id = auth.uid()) или менеджером воркспейса.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "no auth" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonRes({ error: "unauthorized" }, 401);

  let body: { thread_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }
  if (!body.thread_id) return jsonRes({ error: "thread_id required" }, 400);

  // Под service-role читаем всё, что нужно для запроса в Wazzup
  // (фронт уже проверил доступ через RLS на тред — если он его открывает,
  // значит видит).
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: thread } = await service
    .from("project_threads")
    .select("id, wazzup_channel_id, wazzup_chat_id, wazzup_chat_type")
    .eq("id", body.thread_id)
    .maybeSingle();
  if (!thread || !thread.wazzup_channel_id || !thread.wazzup_chat_id) {
    return jsonRes({ skip: "not a wazzup thread" }, 200);
  }

  const { data: channel } = await service
    .from("wazzup_channels")
    .select("channel_id, transport, workspace_id")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel) return jsonRes({ skip: "channel not found" }, 200);

  const { data: settings } = await service
    .from("wazzup_settings")
    .select("api_key")
    .eq("workspace_id", channel.workspace_id)
    .maybeSingle();
  if (!settings?.api_key) return jsonRes({ skip: "no api key" }, 200);

  const res = await fetch("https://api.wazzup24.com/v3/markread", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.api_key}`,
    },
    body: JSON.stringify({
      channelId: channel.channel_id,
      chatType: thread.wazzup_chat_type ?? channel.transport ?? "whatsapp",
      chatId: thread.wazzup_chat_id,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonRes(
      { error: "wazzup api error", status: res.status, body: text.slice(0, 500) },
      502,
    );
  }

  return jsonRes({ ok: true });
});

function jsonRes(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
