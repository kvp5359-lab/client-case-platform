/**
 * Edge Function: telegram-mtproto-send
 *
 * Прокси между фронтом и MTProto-сервисом для отправки сообщений с
 * вложениями. Триггер БД пропускает сообщения с has_attachments=true
 * (см. notify_telegram_on_new_message), потому что в момент INSERT'а
 * файлы ещё не прикреплены к message_attachments. Поэтому фронт после
 * прикрепления вложений сам зовёт эту функцию.
 *
 * Зачем не звать MTProto-сервис напрямую с фронта:
 *  - x-internal-secret живёт только в edge-окружении, не светится в браузер;
 *  - проверка JWT и членства юзера в воркспейсе треда — защита от чужих;
 *  - mtproto_session_user_id и mtproto_client_tg_user_id фронт не должен знать.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { logServerSendFailure } from "../_shared/sendFailureLog.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MTPROTO_SERVICE_URL = Deno.env.get("MTPROTO_SERVICE_URL")
  ?? "https://mtproto.kvp-projects.com";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

interface RequestBody {
  message_id: string; // UUID project_messages
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
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
  if (!body.message_id) {
    return jsonResponse({ error: "message_id required" }, 400, corsHeaders);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, content, has_attachments, reply_to_message_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonResponse({ error: "Message not eligible" }, 400, corsHeaders);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("mtproto_session_user_id, mtproto_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.mtproto_session_user_id || !thread.mtproto_client_tg_user_id) {
    return jsonResponse({ error: "Not a MTProto thread" }, 400, corsHeaders);
  }

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

  // Resolve reply_to: telegram_message_id оригинала.
  let replyToTelegramId: number | null = null;
  if (msg.reply_to_message_id) {
    const { data: orig } = await service
      .from("project_messages")
      .select("telegram_message_id")
      .eq("id", msg.reply_to_message_id)
      .maybeSingle();
    replyToTelegramId = (orig as { telegram_message_id?: number } | null)?.telegram_message_id ?? null;
  }

  const payload = {
    user_id: thread.mtproto_session_user_id,
    client_tg_user_id: thread.mtproto_client_tg_user_id,
    text: msg.content ?? "",
    has_attachments: msg.has_attachments === true,
    message_id_internal: msg.id,
    reply_to_telegram_message_id: replyToTelegramId,
  };

  try {
    const res = await fetch(`${MTPROTO_SERVICE_URL}/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      // MTProto-сервис вернул не-2xx — лог в журнал, фронт получит sticky-toast.
      let parsedErr: string = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        parsedErr = (j?.error as string) ?? parsedErr;
      } catch { /* keep text */ }
      await logServerSendFailure(service, {
        message_id: msg.id,
        error_text: parsedErr,
        error_code: `mtproto_${res.status}`,
        source: "telegram_mtproto",
        metadata: { stage: "send" },
      });
    }
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await logServerSendFailure(service, {
      message_id: msg.id,
      error_text: `MTProto service unreachable: ${err}`.slice(0, 500),
      error_code: "mtproto_unreachable",
      source: "telegram_mtproto",
      metadata: { stage: "fetch" },
    });
    return jsonResponse({ error: `service unreachable: ${err}` }, 502, corsHeaders);
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
