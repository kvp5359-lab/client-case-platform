/**
 * Edge Function: waha-webhook — приём входящих WhatsApp через self-hosted WAHA.
 *
 * WAHA (devlikeapro/waha, движок NOWEB) шлёт события на этот вебхук.
 * Обрабатываем:
 *  - event=message        — входящее/исходящее (fromMe). Личка (@c.us/@lid) и ГРУППЫ (@g.us).
 *  - event=session.status — статус сессии (WORKING/FAILED/…) → waha_sessions.status.
 *
 * Защита: секрет в query ?key=<WAHA_WEBHOOK_SECRET> (сверяем с env).
 * Деплой: --no-verify-jwt (вызывает внешний сервис WAHA, без пользовательского JWT).
 *
 * MVP: текст + треды (личка/группа) + отправитель в группе + дедуп + reply + статус сессии.
 * Медиа-вложения — на этапе шлифовки (пометка has_attachments, скачивание TODO).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAHA_WEBHOOK_SECRET = Deno.env.get("WAHA_WEBHOOK_SECRET") ?? "";

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
const ok = () => new Response("ok", { status: 200 });

interface WahaPayload {
  id?: string;
  timestamp?: number;
  from?: string;      // чат: …@c.us (личка) / …@g.us (группа) / …@lid
  to?: string;
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
  participant?: string;              // в группе — кто написал (JID участника)
  replyTo?: { id?: string } | null;
  notifyName?: string;
  _data?: { notifyName?: string; pushName?: string; chat?: { name?: string } };
}
interface WahaEvent {
  event?: string;
  session?: string;
  payload?: WahaPayload & { name?: string; status?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return ok();

  // Защита: секрет в query
  const url = new URL(req.url);
  if (!WAHA_WEBHOOK_SECRET || url.searchParams.get("key") !== WAHA_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let evt: WahaEvent;
  try { evt = await req.json() as WahaEvent; } catch { return ok(); }

  const service = svc();
  try {
    if (evt.event === "session.status") {
      await handleSessionStatus(service, evt);
    } else if (evt.event === "message" && evt.payload) {
      await handleMessage(service, evt.session ?? "", evt.payload);
    }
  } catch (err) {
    console.error("[waha-webhook] handler error:", err);
  }
  return ok();
});

// ───────────────────────────────────────────────────────────────────────────
// Статус сессии
// ───────────────────────────────────────────────────────────────────────────
async function handleSessionStatus(service: SupabaseClient, evt: WahaEvent) {
  const name = evt.payload?.name ?? evt.session;
  const status = evt.payload?.status;
  if (!name || !status) return;
  await service.from("waha_sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("session_name", name);
}

// ───────────────────────────────────────────────────────────────────────────
// Входящее/исходящее сообщение
// ───────────────────────────────────────────────────────────────────────────
async function handleMessage(service: SupabaseClient, sessionName: string, p: WahaPayload) {
  const chatId = p.from;
  if (!sessionName || !chatId || !p.id) return;

  // 1. Сессия → сотрудник + воркспейс
  const { data: session } = await service
    .from("waha_sessions")
    .select("id, workspace_id, owner_user_id")
    .eq("session_name", sessionName)
    .maybeSingle();
  if (!session || !session.owner_user_id) {
    console.warn(`[waha-webhook] session '${sessionName}' not registered/assigned`);
    return;
  }
  const workspaceId = session.workspace_id as string;
  const ownerUserId = session.owner_user_id as string;

  const isGroup = chatId.endsWith("@g.us");
  const senderJid = isGroup ? (p.participant ?? chatId) : chatId;
  const pushName = p._data?.notifyName ?? p._data?.pushName ?? p.notifyName ?? null;

  // 2. Тред: один на (сессия, чат) среди живых
  const threadId = await ensureWahaThread(service, {
    sessionId: session.id as string,
    workspaceId, ownerUserId, chatId, isGroup,
    displayName: isGroup
      ? (p._data?.chat?.name ?? `Группа WhatsApp`)
      : (pushName ?? jidToNumber(chatId)),
  });

  // 3. Контент
  const rawBody = (p.body ?? "").trim();
  const content = rawBody || (p.hasMedia ? "📎" : "[сообщение]");

  // 4. Reply-lookup по waha_message_id оригинала
  let replyToDbId: string | null = null;
  if (p.replyTo?.id) {
    const { data: r } = await service.from("project_messages")
      .select("id").eq("waha_message_id", p.replyTo.id).maybeSingle();
    replyToDbId = r?.id ?? null;
  }

  // 5. Отправитель. fromMe=true → сотрудник (владелец сессии). Иначе — клиент/участник.
  let senderParticipantId: string | null = null;
  let senderName: string;
  let senderRole: string;
  if (p.fromMe) {
    const { data: participant } = await service.from("participants")
      .select("id, name, last_name")
      .eq("user_id", ownerUserId).eq("workspace_id", workspaceId)
      .eq("is_deleted", false).maybeSingle();
    senderParticipantId = participant?.id ?? null;
    senderName = participant
      ? [participant.name, participant.last_name].filter(Boolean).join(" ").trim()
      : "Сотрудник";
    senderRole = "Сотрудник";
  } else {
    senderName = pushName ?? jidToNumber(senderJid);
    senderRole = "Клиент";
  }

  // 6. INSERT (дедуп по uq_project_messages_waha_message_id → 23505 при повторе)
  const { error } = await service.from("project_messages").insert({
    project_id: null,
    workspace_id: workspaceId,
    thread_id: threadId,
    sender_participant_id: senderParticipantId,
    sender_name: senderName,
    sender_role: senderRole,
    content,
    source: "waha",
    channel: "client",
    waha_message_id: p.id,
    reply_to_message_id: replyToDbId,
    has_attachments: !!p.hasMedia,
  });
  if (error && error.code !== "23505") {
    console.error("[waha-webhook] insert error:", error);
  }
  // TODO (шлифовка): скачивание медиа через WAHA media API + message_attachments,
  // авто-транскрипция voice/audio, аватар контакта.
}

// ───────────────────────────────────────────────────────────────────────────
// Тред WhatsApp (личный диалог / группа), без проекта — как wazzup/mtproto
// ───────────────────────────────────────────────────────────────────────────
async function ensureWahaThread(
  service: SupabaseClient,
  a: {
    sessionId: string; workspaceId: string; ownerUserId: string;
    chatId: string; isGroup: boolean; displayName: string;
  },
): Promise<string> {
  const { data: existing } = await service.from("project_threads")
    .select("id")
    .eq("waha_session_id", a.sessionId)
    .eq("waha_chat_id", a.chatId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (existing) return existing.id as string;

  // Контакт: только для личных чатов (в группе собеседник неоднозначен)
  let contactId: string | null = null;
  if (!a.isGroup) {
    const phone = a.chatId.endsWith("@c.us") ? jidToNumber(a.chatId) : null;
    const { data: cid } = await service.rpc("find_or_create_contact_participant", {
      p_workspace_id: a.workspaceId,
      p_name: a.displayName,
      p_phone: phone,
    });
    contactId = (cid as string) ?? null;
  }

  const { data: created, error } = await service.from("project_threads").insert({
    project_id: null,
    owner_user_id: a.ownerUserId,
    contact_participant_id: contactId,
    workspace_id: a.workspaceId,
    name: a.displayName,
    type: "chat",
    access_type: "all",
    waha_session_id: a.sessionId,
    waha_chat_id: a.chatId,
    waha_group: a.isGroup,
    icon: "whatsapp",
    accent_color: "emerald",
    created_by: a.ownerUserId,
  }).select("id").single();

  if (error || !created) {
    // Гонка: параллельный webhook мог создать тред — перечитываем
    const { data: race } = await service.from("project_threads")
      .select("id").eq("waha_session_id", a.sessionId)
      .eq("waha_chat_id", a.chatId).eq("is_deleted", false).maybeSingle();
    if (race) return race.id as string;
    throw new Error(`Failed to create waha thread: ${error?.message}`);
  }
  return created.id as string;
}

function jidToNumber(jid: string): string {
  const local = jid.split("@")[0] ?? jid;
  return local.split(":")[0] || jid;
}
