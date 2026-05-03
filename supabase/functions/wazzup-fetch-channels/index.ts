/**
 * Edge Function: wazzup-fetch-channels
 *
 * Дёргает GET https://api.wazzup24.com/v3/channels с API-ключом воркспейса
 * и upsert'ит каналы в нашу таблицу wazzup_channels.
 *
 * Зачем отдельная функция:
 *  - API-ключ не светится в браузере (он в БД, читается под service-role).
 *  - CORS: Wazzup может не позволить прямой fetch из браузера.
 *  - Маппинг ответа Wazzup в нашу схему (transport, state, name, phone).
 *
 * Auth: пользовательский JWT. Проверяем, что вызывающий — менеджер
 * этого воркспейса (manage_workspace_settings).
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

interface WazzupChannelDTO {
  channelId: string;
  transport?: string;
  state?: string;
  name?: string;
  plainId?: string;       // у некоторых транспортов — телефон/username
  phone?: string;
  username?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonRes({ error: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonRes({ error: "no auth" }, 401);
  }

  // Клиент с пользовательским JWT — для проверки RLS-доступа к настройкам.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonRes({ error: "unauthorized" }, 401);

  let body: { workspace_id?: string };
  try {
    body = (await req.json()) as { workspace_id?: string };
  } catch {
    return jsonRes({ error: "invalid json" }, 400);
  }
  if (!body.workspace_id) return jsonRes({ error: "workspace_id required" }, 400);

  // RLS на wazzup_settings уже разрешает SELECT только менеджерам — если
  // выборка пустая, юзер либо не в воркспейсе, либо не менеджер, либо
  // настройки ещё не созданы.
  const { data: settings } = await userClient
    .from("wazzup_settings")
    .select("api_key, webhook_secret")
    .eq("workspace_id", body.workspace_id)
    .maybeSingle();

  if (!settings) {
    return jsonRes({ error: "no wazzup settings or no access" }, 403);
  }

  // Тянем каналы у Wazzup
  const wazzupRes = await fetch("https://api.wazzup24.com/v3/channels", {
    method: "GET",
    headers: { Authorization: `Bearer ${settings.api_key}` },
  });

  if (!wazzupRes.ok) {
    const text = await wazzupRes.text().catch(() => "");
    return jsonRes(
      { error: "wazzup api error", status: wazzupRes.status, body: text.slice(0, 500) },
      502,
    );
  }

  const channels = (await wazzupRes.json().catch(() => [])) as WazzupChannelDTO[];
  if (!Array.isArray(channels)) {
    return jsonRes({ error: "unexpected wazzup response" }, 502);
  }

  // Upsert каналов под service-role (чтобы и работало, и не зависело от
  // INSERT-полиси на wazzup_channels).
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (const ch of channels) {
    const phone = ch.phone ?? ch.plainId ?? null;
    const name = ch.name ?? ch.username ?? phone ?? ch.channelId;

    await service
      .from("wazzup_channels")
      .upsert(
        {
          workspace_id: body.workspace_id,
          channel_id: ch.channelId,
          transport: ch.transport ?? "unknown",
          name,
          phone,
          state: ch.state ?? null,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "channel_id" },
      );
  }

  return jsonRes({ ok: true, count: channels.length });
});

function jsonRes(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
