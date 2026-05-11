/**
 * Edge Function: wazzup-mark-read
 *
 * При открытии Wazzup-треда фронт дёргает эту функцию, чтобы сказать
 * Wazzup'у «всё прочитано» — клиент в WhatsApp видит синие галочки.
 * POST https://api.wazzup24.com/v3/markread { channelId, chatType, chatId }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  preflight, jsonRes, getUser, getUserClient, getServiceClient,
} from "../_shared/edge.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return jsonRes({ error: "method not allowed" }, 405, req);

  const user = await getUser(req);
  if (!user) return jsonRes({ error: "unauthorized" }, 401, req);

  let body: { thread_id?: string };
  try { body = await req.json(); } catch { return jsonRes({ error: "invalid json" }, 400, req); }
  if (!body.thread_id) return jsonRes({ error: "thread_id required" }, 400, req);

  // Под service-role читаем то, что нужно для запроса в Wazzup. Доступ к
  // треду фронт уже подтвердил RLS'ом — иначе пользователь его не видел бы.
  const _userClient = getUserClient(req); // зарезервировано на будущие RLS-проверки
  const service = getServiceClient();

  const { data: thread } = await service
    .from("project_threads")
    .select("id, wazzup_channel_id, wazzup_chat_id, wazzup_chat_type")
    .eq("id", body.thread_id)
    .maybeSingle();
  if (!thread || !thread.wazzup_channel_id || !thread.wazzup_chat_id) {
    return jsonRes({ skip: "not a wazzup thread" }, 200, req);
  }

  const { data: channel } = await service
    .from("wazzup_channels")
    .select("channel_id, transport, workspace_id")
    .eq("id", thread.wazzup_channel_id)
    .maybeSingle();
  if (!channel) return jsonRes({ skip: "channel not found" }, 200, req);

  const { data: settings } = await service
    .from("wazzup_settings")
    .select("api_key")
    .eq("workspace_id", channel.workspace_id)
    .maybeSingle();
  if (!settings?.api_key) return jsonRes({ skip: "no api key" }, 200, req);

  const res = await fetch("https://api.wazzup24.com/v3/markread", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.api_key}`,
    },
    body: JSON.stringify({
      channelId: channel.channel_id,
      chatType: thread.wazzup_chat_type ?? channel.transport ?? "whatsapp",
      chatId: thread.wazzup_chat_id,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return jsonRes(
      { error: "wazzup api error", status: res.status, body: text.slice(0, 500) },
      502,
      req,
    );
  }

  return jsonRes({ ok: true }, 200, req);
});
