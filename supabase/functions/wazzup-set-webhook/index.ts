/**
 * Edge Function: wazzup-set-webhook
 *
 * Wazzup НЕ позволяет настроить webhook через UI кабинета — только через
 * API: PATCH https://api.wazzup24.com/v3/webhooks с телом
 *   { webhooksUri, subscriptions: { messagesAndStatuses, channelsUpdates, ... } }
 *
 * Эта функция:
 *  1. Берёт api_key и webhook_secret воркспейса.
 *  2. Собирает наш URL вида https://<project>.supabase.co/functions/v1/wazzup-webhook?key=<secret>.
 *  3. Делает PATCH на Wazzup, подписывая на messagesAndStatuses + channelsUpdates.
 *
 * Auth: пользовательский JWT, проверяется RLS на wazzup_settings (менеджеры воркспейса).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "no auth" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonRes({ error: "unauthorized" }, 401);

  let body: { workspace_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }
  if (!body.workspace_id) return jsonRes({ error: "workspace_id required" }, 400);

  // RLS на wazzup_settings отдаст только менеджеру воркспейса.
  const { data: settings } = await userClient
    .from("wazzup_settings")
    .select("api_key, webhook_secret")
    .eq("workspace_id", body.workspace_id)
    .maybeSingle();
  if (!settings) return jsonRes({ error: "no wazzup settings or no access" }, 403);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wazzup-webhook?key=${settings.webhook_secret}`;

  const res = await fetch("https://api.wazzup24.com/v3/webhooks", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.api_key}`,
    },
    body: JSON.stringify({
      webhooksUri: webhookUrl,
      subscriptions: {
        messagesAndStatuses: true,
        channelsUpdates: true,
        contactsAndDealsCreation: false,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonRes(
      { error: "wazzup api error", status: res.status, body: text.slice(0, 500) },
      502,
    );
  }

  return jsonRes({ ok: true, webhookUrl });
});

function jsonRes(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
