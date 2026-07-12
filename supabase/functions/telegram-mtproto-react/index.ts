/**
 * Edge Function: telegram-mtproto-react
 *
 * Прокси-функция между фронтом и MTProto-сервисом на VPS для постановки
 * реакций. Зачем нужна:
 *  1. Фронт работает с JWT юзера → проверяем что юзер действительно
 *     участник воркспейса этого треда. Без этого — может реагировать от
 *     чужого имени.
 *  2. Хранит client_tg_user_id (нужен MTProto-сервису) — фронт не должен
 *     знать про tg-id'ы клиентов, только про project_message_id.
 *  3. Защищает x-internal-secret — он живёт только в edge-окружении,
 *     не светится в браузер.
 *
 * Поведение, повторяющее RPC toggle_message_reaction:
 *  - Если у юзера уже есть та же реакция на это сообщение → снять
 *    (delete row в message_reactions + reactions/set с emoji=null).
 *  - Если другая → заменить (delete старую, insert новую).
 *  - Если нет → поставить.
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
  message_id: string;     // UUID project_messages
  participant_id: string; // UUID participants
  emoji: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonRes({ error: "Method not allowed" }, 405, req);
  }

  // JWT юзера
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
  if (!body.message_id || !body.participant_id || !body.emoji) {
    return jsonRes({ error: "message_id, participant_id, emoji required" }, 400, req);
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Достаём сообщение → тред → MTProto-привязку.
  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id, thread_id, telegram_message_id")
    .eq("id", body.message_id)
    .maybeSingle();
  if (!msg || !msg.thread_id || !msg.telegram_message_id) {
    return jsonRes({ error: "Message not eligible" }, 400, req);
  }

  const { data: thread } = await service
    .from("project_threads")
    .select("mtproto_session_user_id, mtproto_client_tg_user_id")
    .eq("id", msg.thread_id)
    .maybeSingle();
  if (!thread?.mtproto_session_user_id || !thread.mtproto_client_tg_user_id) {
    return jsonRes({ error: "Not a MTProto thread" }, 400, req);
  }

  // 2. Проверка членства юзера в воркспейсе (защита от чужих participant_id).
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", msg.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!participant || participant.id !== body.participant_id) {
    return jsonRes({ error: "Forbidden" }, 403, req);
  }

  // 3. Toggle-логика на стороне БД, как в RPC.
  const { data: existing } = await service
    .from("message_reactions")
    .select("id, emoji")
    .eq("message_id", body.message_id)
    .eq("participant_id", body.participant_id)
    .maybeSingle();

  let added = false;
  if (existing && existing.emoji === body.emoji) {
    // Снять
    await service.from("message_reactions").delete().eq("id", existing.id);
    await callMTProto({
      user_id: thread.mtproto_session_user_id as string,
      client_tg_user_id: thread.mtproto_client_tg_user_id as number,
      telegram_message_id: msg.telegram_message_id as number,
      emoji: null,
    });
  } else {
    if (existing) {
      await service.from("message_reactions").delete().eq("id", existing.id);
    }
    await service.from("message_reactions").insert({
      message_id: body.message_id,
      participant_id: body.participant_id,
      emoji: body.emoji,
    });
    await callMTProto({
      user_id: thread.mtproto_session_user_id as string,
      client_tg_user_id: thread.mtproto_client_tg_user_id as number,
      telegram_message_id: msg.telegram_message_id as number,
      emoji: body.emoji,
    });
    added = true;
  }

  return jsonRes({ added }, 200, req);
});

async function callMTProto(args: {
  user_id: string;
  client_tg_user_id: number;
  telegram_message_id: number;
  emoji: string | null;
}): Promise<void> {
  console.log(`[telegram-mtproto-react] DEBUG url=${MTPROTO_SERVICE_URL} secret_len=${INTERNAL_SECRET.length}`);
  try {
    const res = await fetch(`${MTPROTO_SERVICE_URL}/reactions/set`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[telegram-mtproto-react] service ${res.status}: ${text}`);
    }
  } catch (err) {
    console.warn("[telegram-mtproto-react] service unreachable:", err);
  }
}
