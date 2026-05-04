/**
 * Edge Function: wazzup-set-webhook
 *
 * Wazzup НЕ позволяет настроить webhook через UI кабинета — только через
 * API: PATCH https://api.wazzup24.com/v3/webhooks. Эта функция:
 *  1. Берёт api_key и webhook_secret воркспейса.
 *  2. Собирает наш URL: https://<project>.supabase.co/functions/v1/wazzup-webhook?key=<secret>.
 *  3. Делает PATCH, подписывая на messagesAndStatuses + channelsUpdates.
 *
 * Auth: пользовательский JWT, проверяется RLS на wazzup_settings.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  preflight, jsonRes, getUser, getUserClient, SUPABASE_URL,
} from "../_shared/edge.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "unauthorized" }, 401);

  let body: { workspace_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400); }
  if (!body.workspace_id) return jsonRes({ error: "workspace_id required" }, 400);

  const userClient = getUserClient(req);
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
