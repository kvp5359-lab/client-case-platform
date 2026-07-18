/**
 * Edge Function: waha-webhook — приём входящих WhatsApp через self-hosted WAHA.
 *
 * WAHA (devlikeapro/waha, движок NOWEB) шлёт события на этот вебхук.
 *  - event=message        — входящее/исходящее (fromMe). Личка (@c.us/@lid) и ГРУППЫ (@g.us).
 *  - event=session.status — статус сессии → waha_sessions.status.
 *
 * Защита: секрет в query ?key=<WAHA_WEBHOOK_SECRET>. Деплой --no-verify-jwt.
 * Медиа скачивается из WAHA и кладётся через общий storeAttachment (как wazzup).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { storeAttachment } from "../_shared/storeAttachment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WAHA_WEBHOOK_SECRET = Deno.env.get("WAHA_WEBHOOK_SECRET") ?? "";
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/+$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
const ok = () => new Response("ok", { status: 200 });

interface WahaMedia { url?: string; mimetype?: string; filename?: string; error?: unknown }
interface WahaPayload {
  id?: string;
  from?: string;
  to?: string;
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
  media?: WahaMedia | null;
  participant?: string;
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

async function handleSessionStatus(service: SupabaseClient, evt: WahaEvent) {
  const name = evt.payload?.name ?? evt.session;
  const status = evt.payload?.status;
  if (!name || !status) return;
  await service.from("waha_sessions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("session_name", name);
}

async function handleMessage(service: SupabaseClient, sessionName: string, p: WahaPayload) {
  const chatId = p.from;
  if (!sessionName || !chatId || !p.id) return;

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

  const threadId = await ensureWahaThread(service, {
    sessionId: session.id as string,
    sessionName, workspaceId, ownerUserId, chatId, isGroup,
    fallbackName: isGroup
      ? (p._data?.chat?.name ?? null)
      : (pushName ?? jidToNumber(chatId)),
  });

  const isMedia = !!(p.hasMedia && p.media?.url);
  const rawBody = (p.body ?? "").trim();
  const content = rawBody || (isMedia ? "📎" : "[сообщение]");

  let replyToDbId: string | null = null;
  if (p.replyTo?.id) {
    const { data: r } = await service.from("project_messages")
      .select("id").eq("waha_message_id", p.replyTo.id).maybeSingle();
    replyToDbId = r?.id ?? null;
  }

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

  const { data: inserted, error } = await service.from("project_messages").insert({
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
    has_attachments: isMedia,
  }).select("id").single();

  if (error) {
    if (error.code !== "23505") console.error("[waha-webhook] insert error:", error);
    return; // 23505 = дубль webhook
  }

  // Медиа: скачать из WAHA → storeAttachment
  if (isMedia && p.media?.url) {
    await downloadAndAttach(service, {
      messageId: inserted.id as string, workspaceId, mediaUrl: p.media.url,
      mimeType: p.media.mimetype ?? "application/octet-stream",
      fileName: p.media.filename ?? guessName(p.media.mimetype, p.id),
    });
    // Голосовые/аудио → транскрипция (fire-and-forget)
    const mt = p.media.mimetype ?? "";
    if (mt.startsWith("audio/") || mt.includes("ogg")) {
      transcribeFirst(inserted.id as string).catch((e) =>
        console.warn("[waha-webhook] transcribe failed:", e));
    }
  }
}

async function downloadAndAttach(
  service: SupabaseClient,
  a: { messageId: string; workspaceId: string; mediaUrl: string; mimeType: string; fileName: string },
) {
  try {
    // media.url у WAHA несёт ВНУТРЕННИЙ хост (http://localhost:3000) — edge до него
    // не достучится. Берём только путь и склеиваем с публичным WAHA_URL + ключ.
    let abs: string;
    try {
      const u = new URL(a.mediaUrl);
      abs = `${WAHA_URL}${u.pathname}${u.search}`;
    } catch {
      abs = a.mediaUrl.startsWith("http") ? a.mediaUrl : `${WAHA_URL}${a.mediaUrl}`;
    }
    const res = await fetch(abs, { headers: { "X-Api-Key": WAHA_API_KEY } });
    if (!res.ok) { console.warn(`[waha-webhook] media download ${res.status}`); return; }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? a.mimeType;
    await storeAttachment(service, {
      buffer, mimeType: contentType, fileName: a.fileName,
      workspaceId: a.workspaceId, projectId: null as unknown as string, messageId: a.messageId,
    });
  } catch (err) {
    console.error("[waha-webhook] media error:", err);
  }
}

async function transcribeFirst(messageId: string) {
  const service = svc();
  const { data: att } = await service.from("message_attachments")
    .select("id").eq("message_id", messageId).limit(1).maybeSingle();
  if (!att) return;
  await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ attachment_id: att.id }),
  });
}

async function ensureWahaThread(
  service: SupabaseClient,
  a: {
    sessionId: string; sessionName: string; workspaceId: string; ownerUserId: string;
    chatId: string; isGroup: boolean; fallbackName: string | null;
  },
): Promise<string> {
  const { data: existing } = await service.from("project_threads")
    .select("id")
    .eq("waha_session_id", a.sessionId).eq("waha_chat_id", a.chatId)
    .eq("is_deleted", false).maybeSingle();
  if (existing) return existing.id as string;

  // Имя: для группы пробуем реальное имя через WAHA, иначе fallback
  let displayName = a.fallbackName ?? (a.isGroup ? "Группа WhatsApp" : a.chatId);
  if (a.isGroup && WAHA_URL) {
    const groupName = await fetchGroupName(a.sessionName, a.chatId);
    if (groupName) displayName = groupName;
  }

  let contactId: string | null = null;
  if (!a.isGroup) {
    const phone = a.chatId.endsWith("@c.us") ? jidToNumber(a.chatId) : null;
    const { data: cid } = await service.rpc("find_or_create_contact_participant", {
      p_workspace_id: a.workspaceId, p_name: displayName, p_phone: phone,
    });
    contactId = (cid as string) ?? null;
  }

  const { data: created, error } = await service.from("project_threads").insert({
    project_id: null,
    owner_user_id: a.ownerUserId,
    contact_participant_id: contactId,
    workspace_id: a.workspaceId,
    name: displayName,
    type: "chat", access_type: "all",
    waha_session_id: a.sessionId, waha_chat_id: a.chatId, waha_group: a.isGroup,
    icon: "whatsapp", accent_color: "emerald",
    created_by: a.ownerUserId,
  }).select("id").single();

  if (error || !created) {
    const { data: race } = await service.from("project_threads")
      .select("id").eq("waha_session_id", a.sessionId)
      .eq("waha_chat_id", a.chatId).eq("is_deleted", false).maybeSingle();
    if (race) return race.id as string;
    throw new Error(`Failed to create waha thread: ${error?.message}`);
  }
  return created.id as string;
}

async function fetchGroupName(sessionName: string, groupId: string): Promise<string | null> {
  try {
    const res = await fetch(`${WAHA_URL}/api/${sessionName}/groups/${encodeURIComponent(groupId)}`, {
      headers: { "X-Api-Key": WAHA_API_KEY },
    });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    const name = d?.name ?? d?.subject ?? d?.groupMetadata?.subject ?? null;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch { return null; }
}

function guessName(mime: string | undefined, id: string): string {
  const ext = mime?.split("/")[1]?.split(";")[0] ?? "bin";
  return `waha_${id.slice(-8)}.${ext}`;
}
function jidToNumber(jid: string): string {
  const local = jid.split("@")[0] ?? jid;
  return local.split(":")[0] || jid;
}
