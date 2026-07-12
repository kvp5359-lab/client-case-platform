/**
 * Edge Function: telegram-mtproto-delete
 *
 * Прокси между фронтом и MTProto-сервисом для УДАЛЕНИЯ сообщений/файлов в
 * личном Telegram-диалоге (gramjs deleteMessages, revoke=и у клиента).
 *
 * Зачем через edge (как telegram-mtproto-send):
 *  - x-internal-secret живёт только в edge-окружении;
 *  - проверка JWT и членства юзера в воркспейсе треда;
 *  - mtproto_session_user_id / mtproto_client_tg_user_id фронт знать не должен.
 *
 * Тело запроса:
 *  - message_id: UUID project_messages (обязателен).
 *  - telegram_message_ids?: number[] — какие внешние id удалить. Если не задано —
 *    удаляем все id сообщения (telegram_message_ids или [telegram_message_id]).
 *    Для точечного удаления одного файла (Стадия 2) фронт передаёт один id.
 *
 * Ответ: 200 { ok: true } — удалено; 200 { ok: false, reason } — канал не дал
 * удалить (честно показываем пользователю); не-2xx — ошибка авторизации/валидации.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isInternalVisibility, assertWorkspaceMembership } from "../_shared/outgoing.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, jsonRes } from "../_shared/edge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MTPROTO_SERVICE_URL = Deno.env.get("MTPROTO_SERVICE_URL")
  ?? "https://mtproto.kvp-projects.com";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

interface RequestBody {
  message_id: string;
  telegram_message_ids?: number[];
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
  if (!body.message_id) {
    return jsonRes({ error: "message_id required" }, 400, req);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, telegram_message_id, telegram_message_ids")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonRes({ error: "Message not found" }, 400, req);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("mtproto_session_user_id, mtproto_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.mtproto_session_user_id || !thread.mtproto_client_tg_user_id) {
    return jsonRes({ error: "Not a MTProto thread" }, 400, req);
  }

  // Членство — защита от чужих.
  if (!(await assertWorkspaceMembership(service, user.id, msg.workspace_id))) {
    return jsonRes({ error: "Forbidden" }, 403, req);
  }

  // Какие внешние id удаляем: явный список (точечно) или все id сообщения.
  const explicit = Array.isArray(body.telegram_message_ids)
    ? body.telegram_message_ids.filter((n) => Number.isInteger(n))
    : null;
  const allIds = Array.isArray(msg.telegram_message_ids) && msg.telegram_message_ids.length > 0
    ? (msg.telegram_message_ids as number[])
    : (msg.telegram_message_id != null ? [msg.telegram_message_id as number] : []);
  const idsToDelete = explicit && explicit.length > 0 ? explicit : allIds;
  if (idsToDelete.length === 0) {
    return jsonRes({ ok: false, reason: "нет внешних id для удаления" }, 200, req);
  }

  const payload = {
    user_id: thread.mtproto_session_user_id,
    client_tg_user_id: thread.mtproto_client_tg_user_id,
    telegram_message_ids: idsToDelete,
    revoke: true,
  };

  try {
    const res = await fetch(`${MTPROTO_SERVICE_URL}/messages/delete`, {
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
      return jsonRes({ ok: false, reason }, 200, req);
    }
    return jsonRes({ ok: true }, 200, req);
  } catch (err) {
    return jsonRes({ ok: false, reason: `service unreachable: ${err}` }, 200, req);
  }
});
