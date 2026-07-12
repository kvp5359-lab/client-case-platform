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
import { isInternalVisibility, assertWorkspaceMembership } from "../_shared/outgoing.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, jsonRes } from "../_shared/edge.ts";
import { markMessageFailed, markMessageSent } from "../_shared/messageSendStatus.ts";

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
    .select("id, workspace_id, thread_id, content, has_attachments, reply_to_message_id, visibility")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) {
    return jsonRes({ error: "Message not eligible" }, 400, req);
  }

  // 🔒 Backstop: НЕ отправляем во внешний канал внутренние сообщения (team/self/
  // «Заметка»). Фронт уже гейтит внешнюю доставку по visibility, это защита
  // на уровне канала — утечка внутреннего сообщения клиенту критична
  // (баг 2026-07-08: внутреннее сообщение с файлом ушло клиенту в группу).
  if (isInternalVisibility((msg as { visibility?: string | null }).visibility)) {
    await markMessageSent(service, msg.id, { channelFields: {} });
    return jsonRes({ ok: true, skipped: "internal_visibility" }, 200, req);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("mtproto_session_user_id, mtproto_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.mtproto_session_user_id || !thread.mtproto_client_tg_user_id) {
    return jsonRes({ error: "Not a MTProto thread" }, 400, req);
  }

  if (!(await assertWorkspaceMembership(service, user.id, msg.workspace_id))) {
    return jsonRes({ error: "Forbidden" }, 403, req);
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
      // mtproto-service сам уже выставил send_status='failed' внутри.
      // На случай если он этого не успел (например, ответ был 500 ещё до
      // его post-error UPDATE) — дублируем безопасно: повторный markFailed
      // идемпотентен и не сломает уже выставленный статус.
      await markMessageFailed(service, msg.id, parsedErr, {
        failureSource: "telegram_mtproto",
        failureCode: `mtproto_${res.status}`,
        failureMetadata: { stage: "send" },
      });
    }
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Сервис вообще unreachable — mtproto-service не успел поставить статус,
    // выставляем сами.
    await markMessageFailed(
      service,
      msg.id,
      `MTProto service unreachable: ${err}`.slice(0, 500),
      {
        failureSource: "telegram_mtproto",
        failureCode: "mtproto_unreachable",
        failureMetadata: { stage: "fetch" },
      },
    );
    return jsonRes({ error: `service unreachable: ${err}` }, 502, req);
  }
});
