/**
 * Edge Function: telegram-business-link-init
 *
 * Шаг 1 из двух при подключении Telegram Business сотрудником:
 * создаёт одноразовый токен и возвращает фронту deep-link на бота
 * @clientcase_bot со start-параметром `biz_<token>`. Сотрудник кликает
 * по ссылке, в Telegram открывается чат с ботом, жмёт START, бот ловит
 * /start, узнаёт его tg_user_id и привязывает в user_telegram_links.
 *
 * Шаг 2 (подключение бота через Telegram → Settings → Business → Chatbots)
 * сотрудник делает руками. После этого Telegram пришлёт business_connection
 * → бот по уже привязанному tg_user_id поймёт, чьё это подключение.
 *
 * Auth: JWT обычного пользователя.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";

interface RequestBody {
  workspace_id: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BUSINESS_BOT_TOKEN = Deno.env.get("TELEGRAM_BUSINESS_BOT_TOKEN")!;

  const auth = req.headers.get("authorization");
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.workspace_id) {
    return jsonResponse({ error: "workspace_id required" }, 400, corsHeaders);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Проверяем, что юзер действительно участник этого воркспейса.
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("workspace_id", body.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!participant) {
    return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
  }

  // Узнаём username бота (для формирования deep-link).
  const meRes = await fetch(
    `https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/getMe`,
  );
  const meJson = (await meRes.json()) as {
    ok: boolean;
    result?: { username?: string };
  };
  if (!meJson.ok || !meJson.result?.username) {
    return jsonResponse({ error: "Bot misconfigured" }, 500, corsHeaders);
  }

  // Гасим протухшие токены (просто чистка — TTL 30 минут).
  await service
    .from("telegram_business_link_tokens")
    .delete()
    .eq("user_id", userData.user.id)
    .is("consumed_at", null)
    .lt("expires_at", new Date().toISOString());

  // Создаём новый токен.
  const { data: tokenRow, error: tokenErr } = await service
    .from("telegram_business_link_tokens")
    .insert({
      user_id: userData.user.id,
      workspace_id: body.workspace_id,
    })
    .select("token, expires_at")
    .single();
  if (tokenErr || !tokenRow) {
    console.error("[telegram-business-link-init] insert error:", tokenErr);
    return jsonResponse({ error: "Failed to create token" }, 500, corsHeaders);
  }

  const deepLink = `https://t.me/${meJson.result.username}?start=biz_${tokenRow.token}`;

  return jsonResponse(
    {
      deep_link: deepLink,
      bot_username: meJson.result.username,
      expires_at: tokenRow.expires_at,
    },
    200,
    corsHeaders,
  );
});

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
