/**
 * Edge Function: telegram-mtproto-backfill
 *
 * Прокси между фронтом и MTProto-сервисом для подгрузки старой истории
 * сообщений треда. Когда сотрудник долистал тред до самого старого
 * сообщения в БД и нажал «Загрузить ещё 50 из Telegram», фронт зовёт эту
 * функцию. Та проверяет JWT + членство юзера в воркспейсе треда и
 * проксирует в `POST /messages/backfill` сервиса с x-internal-secret.
 *
 * Безопасность:
 *  - x-internal-secret живёт только в edge-окружении, не светится в браузер;
 *  - mtproto_session_user_id треда фронт не должен знать;
 *  - membership-чек: только участники воркспейса треда могут догружать.
 *
 * Rate-limit: сам mtproto-service на стороне gramjs-клиента держит
 * throttle 2 сек между запросами per session — выяснять ничего не нужно.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, jsonRes } from "../_shared/edge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MTPROTO_SERVICE_URL = Deno.env.get("MTPROTO_SERVICE_URL")
  ?? "https://mtproto.kvp-projects.com";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

interface RequestBody {
  thread_id: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonRes({ error: "Method not allowed" }, 405, req);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401, req);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return jsonRes({ error: "Unauthorized" }, 401, req);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonRes({ error: "Invalid JSON" }, 400, req);
  }
  if (!body.thread_id) {
    return jsonRes({ error: "thread_id required" }, 400, req);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Проверяем, что тред — MTProto и достаём workspace_id для membership-чека.
  const { data: thread } = await service
    .from("project_threads")
    .select("id, workspace_id, mtproto_session_user_id, mtproto_client_tg_user_id")
    .eq("id", body.thread_id)
    .maybeSingle();
  if (
    !thread ||
    !thread.mtproto_session_user_id ||
    !thread.mtproto_client_tg_user_id
  ) {
    return jsonRes({ error: "Not a MTProto thread" }, 400, req);
  }

  // Membership-чек: пользователь должен быть участником воркспейса треда.
  // Этот же чек висит на telegram-mtproto-send — повторяем для симметрии.
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", thread.workspace_id as string)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!participant) {
    return jsonRes({ error: "Forbidden" }, 403, req);
  }

  try {
    const res = await fetch(`${MTPROTO_SERVICE_URL}/messages/backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ thread_id: body.thread_id }),
    });
    const text = await res.text();
    // Прокидываем Retry-After для FLOOD_WAIT — фронт сможет показать
    // нормальное «попробуйте через N секунд».
    const passHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/json",
    };
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) passHeaders["retry-after"] = retryAfter;
    return new Response(text, {
      status: res.status,
      headers: passHeaders,
    });
  } catch (err) {
    return jsonRes({ error: `service unreachable: ${err}` }, 502, req);
  }
});
