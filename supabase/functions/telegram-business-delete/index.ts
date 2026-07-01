/**
 * Edge Function: telegram-business-delete
 *
 * Удаляет сообщение/файл в Telegram Business (личный диалог сотрудника) через
 * Bot API deleteBusinessMessages(business_connection_id, message_ids). Требует
 * у бота бизнес-право can_delete_sent_messages (выдаётся при подключении бота в
 * Telegram → Бизнес → Чат-боты, галка «Удалять сообщения»). Если права нет —
 * Telegram вернёт ok:false, и мы честно отдаём { ok:false, reason }.
 *
 * Тело: message_id (UUID project_messages, обязателен), telegram_message_ids? —
 * конкретные внешние id (точечное удаление файла). Без них — telegram_message_id
 * сообщения.
 *
 * Auth: JWT обычного пользователя + проверка членства в воркспейсе.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";

interface RequestBody {
  message_id: string;
  telegram_message_ids?: number[];
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUSINESS_BOT_TOKEN = Deno.env.get("TELEGRAM_BUSINESS_BOT_TOKEN")!;

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
  if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.message_id) {
    return jsonResponse({ error: "message_id required" }, 400, corsHeaders);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, telegram_message_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonResponse({ error: "Message not found" }, 404, corsHeaders);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("id, business_connection_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.business_connection_id) {
    return jsonResponse({ error: "Not a business thread" }, 400, corsHeaders);
  }

  const { data: conn } = await service
    .from("telegram_business_connections")
    .select("business_connection_id, workspace_id")
    .eq("id", thread.business_connection_id)
    .maybeSingle();
  if (!conn || conn.workspace_id !== msg.workspace_id) {
    return jsonResponse({ error: "Connection not found" }, 404, corsHeaders);
  }

  // Членство юзера в воркспейсе — защита от чужих.
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", msg.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!participant) {
    return jsonResponse({ error: "Forbidden" }, 403, corsHeaders);
  }

  const explicit = Array.isArray(body.telegram_message_ids)
    ? body.telegram_message_ids.filter((n) => Number.isInteger(n))
    : null;
  const ids = explicit && explicit.length > 0
    ? explicit
    : (msg.telegram_message_id != null ? [msg.telegram_message_id as number] : []);
  if (ids.length === 0) {
    return jsonResponse({ ok: false, reason: "нет внешних id для удаления" }, 200, corsHeaders);
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BUSINESS_BOT_TOKEN}/deleteBusinessMessages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_connection_id: conn.business_connection_id,
          message_ids: ids,
        }),
      },
    );
    const tgData = await res.json() as { ok: boolean; description?: string };
    if (!tgData.ok) {
      const desc = tgData.description ?? "";
      const noRight = /right|permission|can_delete/i.test(desc);
      return jsonResponse(
        {
          ok: false,
          reason: noRight
            ? "у бота нет права на удаление в Business (включите «Удалять сообщения» при подключении бота)"
            : (desc || "Telegram Business не дал удалить"),
        },
        200,
        corsHeaders,
      );
    }
    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[telegram-business-delete] error:", err);
    return jsonResponse({ ok: false, reason: `ошибка запроса: ${err}` }, 200, corsHeaders);
  }
});

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
