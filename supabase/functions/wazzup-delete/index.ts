/**
 * Edge Function: wazzup-delete
 *
 * Удаляет сообщение/файл в Wazzup (WhatsApp/IG): DELETE /v3/message/{messageId}.
 * Работает в пределах окна канала (WhatsApp — «удалить у всех» ~2 суток); за
 * окном Wazzup вернёт ошибку — честно отдаём { ok:false, reason }.
 *
 * Тело: message_id (UUID project_messages, обязателен), wazzup_message_id? —
 * конкретный внешний id (Стадия 2, точечное удаление файла). Без него берём
 * project_messages.wazzup_message_id.
 *
 * Ответ: 200 { ok:true } — удалено; 200 { ok:false, reason } — канал не дал;
 * не-2xx — авторизация/валидация.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isInternalVisibility, assertWorkspaceMembership } from "../_shared/outgoing.ts";
import {
  preflight, jsonRes, getUser, getServiceClient,
} from "../_shared/edge.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405, req);

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "unauthorized" }, 401, req);

  let body: { message_id?: string; wazzup_message_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400, req); }
  if (!body.message_id) return jsonRes({ error: "message_id required" }, 400, req);

  const service = getServiceClient();

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, wazzup_message_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id) return jsonRes({ error: "message not found" }, 400, req);

  // Членство юзера в воркспейсе — защита от чужих (удаление деструктивно).
  if (!(await assertWorkspaceMembership(service, user.id, msg.workspace_id))) {
    return jsonRes({ error: "forbidden" }, 403, req);
  }

  const wazzupMessageId = body.wazzup_message_id ?? (msg.wazzup_message_id as string | null);
  if (!wazzupMessageId) {
    return jsonRes({ ok: false, reason: "нет внешнего id для удаления" }, 200, req);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("wazzup_channel_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.wazzup_channel_id) return jsonRes({ ok: false, reason: "не Wazzup-тред" }, 200, req);

  const { data: channel } = await service
    .from("wazzup_channels")
    .select("workspace_id")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel) return jsonRes({ ok: false, reason: "канал не найден" }, 200, req);

  const { data: settings } = await service
    .from("wazzup_settings")
    .select("api_key")
    .eq("workspace_id", channel.workspace_id)
    .maybeSingle();
  if (!settings?.api_key) return jsonRes({ ok: false, reason: "нет api-ключа Wazzup" }, 200, req);

  let res: Response;
  try {
    res = await fetch(
      `https://api.wazzup24.com/v3/message/${encodeURIComponent(wazzupMessageId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${settings.api_key}` },
      },
    );
  } catch (e) {
    // Сеть до Wazzup недоступна/таймаут — честный {ok:false}, а не 500.
    return jsonRes(
      { ok: false, reason: `не удалось связаться с Wazzup: ${String(e)}` },
      200,
      req,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonRes(
      { ok: false, reason: `Wazzup не дал удалить (статус ${res.status})`, body: text.slice(0, 300) },
      200,
      req,
    );
  }

  return jsonRes({ ok: true }, 200, req);
});
