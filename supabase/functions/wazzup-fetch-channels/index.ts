/**
 * Edge Function: wazzup-fetch-channels
 *
 * Дёргает GET https://api.wazzup24.com/v3/channels с API-ключом воркспейса
 * и upsert'ит каналы в нашу таблицу wazzup_channels.
 *
 * Зачем отдельная функция:
 *  - API-ключ не светится в браузере (он в БД, читается под service-role).
 *  - CORS: Wazzup может не позволить прямой fetch из браузера.
 *  - Маппинг ответа Wazzup в нашу схему.
 *
 * Auth: пользовательский JWT. RLS на wazzup_settings проверит, что юзер —
 * менеджер этого воркспейса.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  preflight, jsonRes, getUser, getUserClient, getServiceClient,
} from "../_shared/edge.ts";

interface WazzupChannelDTO {
  channelId: string;
  transport?: string;
  state?: string;
  name?: string;
  plainId?: string;
  phone?: string;
  username?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405, req);

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "unauthorized" }, 401, req);

  let body: { workspace_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400, req); }
  if (!body.workspace_id) return jsonRes({ error: "workspace_id required" }, 400, req);

  // RLS на wazzup_settings — только менеджеры воркспейса.
  const userClient = getUserClient(req);
  const { data: settings } = await userClient
    .from("wazzup_settings")
    .select("api_key, webhook_secret")
    .eq("workspace_id", body.workspace_id)
    .maybeSingle();
  if (!settings) return jsonRes({ error: "no wazzup settings or no access" }, 403, req);

  const wazzupRes = await fetch("https://api.wazzup24.com/v3/channels", {
    method: "GET",
    headers: { Authorization: `Bearer ${settings.api_key}` },
  });

  if (!wazzupRes.ok) {
    const text = await wazzupRes.text().catch(() => "");
    return jsonRes(
      { error: "wazzup api error", status: wazzupRes.status, body: text.slice(0, 500) },
      502, req);
  }

  const channels = (await wazzupRes.json().catch(() => [])) as WazzupChannelDTO[];
  if (!Array.isArray(channels)) {
    return jsonRes({ error: "unexpected wazzup response" }, 502, req);
  }

  const service = getServiceClient();
  for (const ch of channels) {
    const phone = ch.phone ?? ch.plainId ?? null;
    const name = ch.name ?? ch.username ?? phone ?? ch.channelId;
    await service.from("wazzup_channels").upsert(
      {
        workspace_id: body.workspace_id,
        channel_id: ch.channelId,
        transport: ch.transport ?? "unknown",
        name, phone, state: ch.state ?? null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" },
    );
  }

  return jsonRes({ ok: true, count: channels.length }, 200, req);
});
