/**
 * Edge Function: telegram-mtproto-edit
 *
 * Прокси между фронтом и MTProto-сервисом для РЕДАКТИРОВАНИЯ сообщений в личном
 * Telegram-диалоге (gramjs editMessage). Зеркало telegram-mtproto-delete.
 *
 * Зачем через edge:
 *  - x-internal-secret живёт только в edge-окружении;
 *  - проверка JWT и членства юзера в воркспейсе треда;
 *  - mtproto_session_user_id / mtproto_client_tg_user_id фронт знать не должен.
 *
 * Раньше правка MTProto-сообщения слалась в telegram-edit-message (бот-канал,
 * который НЕ умеет редактировать MTProto-сообщения) → правка не долетала до
 * Telegram (менялась только БД). Эта функция достраивает проводку через сервис
 * (эндпоинт /messages/edit там существовал, но не вызывался ниоткуда).
 *
 * Тело: message_id (UUID), content (новый текст/HTML).
 * Ответ: 200 { ok:true }; 200 { ok:false, reason } — канал не дал; не-2xx — auth/валидация.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isInternalVisibility, assertWorkspaceMembership } from "../_shared/outgoing.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MTPROTO_SERVICE_URL = Deno.env.get("MTPROTO_SERVICE_URL")
  ?? "https://mtproto.kvp-projects.com";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

interface RequestBody {
  message_id: string;
  content: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.message_id || !body.content) {
    return jsonResponse({ error: "message_id and content required" }, 400, corsHeaders);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, telegram_message_id, telegram_message_ids, visibility")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonResponse({ error: "Message not found" }, 400, corsHeaders);
  }
  // Backstop видимости — единый контракт со всеми исходящими: правку
  // внутреннего (team/self) в канал не шлём.
  if (isInternalVisibility(msg.visibility as string | null)) {
    return jsonResponse({ ok: true, skipped: "internal_visibility" }, 200, corsHeaders);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("mtproto_session_user_id, mtproto_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.mtproto_session_user_id || !thread.mtproto_client_tg_user_id) {
    return jsonResponse({ error: "Not a MTProto thread" }, 400, corsHeaders);
  }

  // Членство — защита от чужих.
  if (!(await assertWorkspaceMembership(service, user.id, msg.workspace_id))) {
    return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
  }

  // Редактируем ПЕРВЫЙ внешний id сообщения (у MTProto-текста он один).
  const tgId = Array.isArray(msg.telegram_message_ids) && msg.telegram_message_ids.length > 0
    ? (msg.telegram_message_ids[0] as number)
    : (msg.telegram_message_id as number | null);
  if (tgId == null) {
    return jsonResponse({ ok: false, reason: "нет внешнего id для правки" }, 200, corsHeaders);
  }

  const payload = {
    user_id: thread.mtproto_session_user_id,
    client_tg_user_id: thread.mtproto_client_tg_user_id,
    telegram_message_id: tgId,
    text: body.content,
  };

  try {
    const res = await fetch(`${MTPROTO_SERVICE_URL}/messages/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      let reason = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        reason = (j?.error as string) ?? reason;
      } catch { /* keep text */ }
      return jsonResponse({ ok: false, reason }, 200, corsHeaders);
    }
    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse({ ok: false, reason: `service unreachable: ${err}` }, 200, corsHeaders);
  }
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
