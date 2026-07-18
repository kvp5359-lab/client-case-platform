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
import {
  bindThreadToWaha, findConnectedNumberOwner, findWhatsAppThreadByPhone,
  normalizePhone, wahaMsgCore,
} from "../_shared/whatsappThread.ts";

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
  source?: string; // "app" — отправлено с телефона, "api" — через WAHA (наш сервис)
  body?: string;
  hasMedia?: boolean;
  media?: WahaMedia | null;
  participant?: string;
  replyTo?: { id?: string } | null;
  notifyName?: string;
  _data?: { notifyName?: string; pushName?: string; chat?: { name?: string } };
}
interface WahaReactionPayload {
  fromMe?: boolean;
  participant?: string;
  from?: string;
  reaction?: { text?: string; messageId?: string } | null;
}
interface WahaEvent {
  event?: string;
  session?: string;
  payload?: WahaPayload & WahaReactionPayload & { name?: string; status?: string; ack?: number; ackName?: string };
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
    } else if (evt.event === "message.reaction" && evt.payload) {
      await handleReaction(service, evt.session ?? "", evt.payload);
    } else if ((evt.event === "message" || evt.event === "message.any") && evt.payload) {
      await handleMessage(service, evt.session ?? "", evt.payload);
    } else if (evt.event === "message.ack" && evt.payload) {
      await handleAck(service, evt.payload);
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

/**
 * Найти НАШУ строку project_messages по WhatsApp-id из reaction/ack/reply.
 *
 * Форматы id расходятся: наши исходящие хранят короткий «MSGID» (из sendText),
 * входящие — полный «false_chat_MSGID_sender». Пришедший id тоже бывает в любом
 * формате, поэтому сводим к «ядру» (самый длинный сегмент без «@») и матчим:
 *   1) точное совпадение полного id и осмысленных сегментов;
 *   2) точное совпадение ядра (короткий stored ↔ полный пришедший);
 *   3) ядро внутри полного stored (полный stored ↔ короткий пришедший).
 * Единая точка — чтобы reaction/ack/reply не расходились в устойчивости поиска.
 */
async function findMessageByWahaId<T = { id: string; thread_id: string }>(
  service: SupabaseClient, extId: string, cols = "id, thread_id",
): Promise<T | null> {
  const segments = extId.split("_").filter(Boolean);
  const meaningful = segments.filter((s) => s !== "false" && s !== "true" && !s.includes("@"));
  const core = [...meaningful].sort((a, b) => b.length - a.length)[0] ?? "";

  for (const cand of new Set([extId, ...meaningful])) {
    const { data } = await service.from("project_messages")
      .select(cols).eq("waha_message_id", cand).limit(1).maybeSingle();
    if (data) return data as T;
  }
  if (core) {
    // Ядро внутри полного stored id. Ядро — [A-Z0-9], без «_»/«%» → безопасно для ilike.
    const { data } = await service.from("project_messages")
      .select(cols).ilike("waha_message_id", `%${core}%`).limit(1).maybeSingle();
    if (data) return data as T;
  }
  return null;
}

/** Числовой ранг статуса доставки — чтобы ack-события не понижали статус (приходят не по порядку). */
const ACK_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/**
 * Статус доставки исходящего (event=message.ack). Уровни WAHA/Baileys:
 *  -1 error, 0 pending, 1 server(sent), 2 device(delivered), 3 read, 4 played.
 * Пишем waha_status (внутреннее/дебаг-поле); при read (≥3) — recipient_read_at,
 * по которому фронт рисует синие галочки (общее поле, правка UI не нужна).
 */
async function handleAck(service: SupabaseClient, p: { id?: string; ack?: number }) {
  const extId = p.id;
  if (!extId) return;
  const ack = typeof p.ack === "number" ? p.ack : 0;
  const status = ack < 0 ? "error" : ack >= 3 ? "read" : ack === 2 ? "delivered" : ack === 1 ? "sent" : null;
  if (!status) return;

  const row = await findMessageByWahaId<{ id: string; waha_status: string | null }>(
    service, extId, "id, waha_status");
  if (!row) return;

  // Не понижать статус (delivered после read не откатывает). error пишем всегда.
  if (status !== "error" && (ACK_RANK[row.waha_status ?? ""] ?? 0) >= ACK_RANK[status]) return;

  const upd: Record<string, unknown> = { waha_status: status };
  if (status === "read") upd.recipient_read_at = new Date().toISOString();
  await service.from("project_messages").update(upd).eq("id", row.id);
}

async function handleReaction(service: SupabaseClient, sessionName: string, p: WahaReactionPayload) {
  const extMsgId = p.reaction?.messageId;
  if (!sessionName || !extMsgId) return;

  const { data: session } = await service.from("waha_sessions")
    .select("workspace_id, owner_user_id").eq("session_name", sessionName).maybeSingle();
  if (!session) return;
  const workspaceId = session.workspace_id as string;

  const msg = await findMessageByWahaId(service, extMsgId);
  if (!msg) { console.warn(`[waha-webhook] reaction: message not found (${extMsgId})`); return; }

  const { data: thread } = await service.from("project_threads")
    .select("contact_participant_id, owner_user_id, name, waha_group").eq("id", msg.thread_id as string).maybeSingle();
  const isGroup = !!thread?.waha_group;

  // Кто реагирует: своя реакция (fromMe) → владелец; иначе собеседник.
  // В группе реагирующий = p.participant (конкретный участник), НЕ p.from (jid группы).
  let participantId: string | null = null;
  if (p.fromMe) {
    const ownerUserId = (thread?.owner_user_id as string) ?? (session.owner_user_id as string);
    const { data: part } = await service.from("participants")
      .select("id").eq("user_id", ownerUserId).eq("workspace_id", workspaceId)
      .eq("is_deleted", false).maybeSingle();
    participantId = part?.id ?? null;
  } else if (isGroup) {
    // Группа: реагирующий участник — по его jid. Контакт треда НЕ трогаем
    // (у группы нет единственного собеседника).
    const reactorJid = p.participant || p.from || "";
    participantId = await ensureWahaContact(service, workspaceId, reactorJid, null);
  } else {
    participantId = (thread?.contact_participant_id as string) ?? null;
    // @lid-чаты часто без привязанного контакта (номер скрыт) — создаём по имени
    if (!participantId) {
      participantId = await ensureWahaContact(service, workspaceId, p.from ?? "", (thread?.name as string) ?? null);
      if (participantId) {
        await service.from("project_threads")
          .update({ contact_participant_id: participantId }).eq("id", msg.thread_id as string);
      }
    }
  }
  if (!participantId) { console.warn(`[waha-webhook] reaction: no participant resolved (isGroup=${isGroup})`); return; }

  // WhatsApp: одна реакция на сообщение от участника → заменяем.
  await service.from("message_reactions")
    .delete().eq("message_id", msg.id).eq("participant_id", participantId);
  const emoji = p.reaction?.text?.trim();
  if (emoji) {
    await service.from("message_reactions").insert({
      message_id: msg.id, participant_id: participantId, emoji,
    });
  }
}

async function handleMessage(service: SupabaseClient, sessionName: string, p: WahaPayload) {
  const chatId = p.from;
  if (!sessionName || !chatId || !p.id) return;

  const { data: session } = await service
    .from("waha_sessions")
    .select("id, workspace_id, owner_user_id, phone")
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

  // Наши сервисные отправки (source=api = через WAHA API из ЛК) уже созданы
  // приложением в БД — эхо пропускаем, чтобы не задваивать.
  if (p.source === "api") return;

  // Атрибуция по ТЕЛЕФОНУ отправителя (а не по fromMe наблюдателя): наш
  // подключённый номер → сотрудник (кто именно), иначе клиент. Устойчиво к
  // нескольким нашим сессиям (группа/1:1 коллег) и обходит баг NOWEB #1350
  // (fromMe=false у своих в группе). Резолв входящего телефона дёргаем только
  // при 2+ наших номерах (иначе входящий — всегда клиент).
  const ownPhone = normalizePhone(session.phone as string | null);
  const { count: sessCount } = await service.from("waha_sessions")
    .select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  const multiNumber = (sessCount ?? 1) > 1;

  let senderPhone: string | null = null;
  if (p.fromMe) senderPhone = ownPhone;
  else if (multiNumber) {
    senderPhone = await resolveWahaPhone(sessionName, isGroup ? (p.participant ?? chatId) : chatId);
  }
  let senderOwnerUserId = senderPhone
    ? await findConnectedNumberOwner(service, workspaceId, senderPhone) : null;
  if (!senderOwnerUserId && p.fromMe) senderOwnerUserId = ownerUserId;

  const threadId = await ensureWahaThread(service, {
    sessionId: session.id as string,
    sessionName, workspaceId, ownerUserId, chatId, isGroup, ownPhone,
    fallbackName: isGroup
      ? (p._data?.chat?.name ?? null)
      : (pushName ?? jidToNumber(chatId)),
  });

  // Группа = общий тред: сотрудник, чей телефон в группе, становится участником
  // треда → видит общую переписку. Идемпотентно, по каждой сессии из группы.
  if (isGroup) await ensureThreadMember(service, threadId, ownerUserId, workspaceId);

  const isMedia = !!(p.hasMedia && p.media?.url);
  const rawBody = (p.body ?? "").trim();
  const content = rawBody || (isMedia ? "📎" : "[сообщение]");

  let replyToDbId: string | null = null;
  if (p.replyTo?.id) {
    const orig = await findMessageByWahaId<{ id: string }>(service, p.replyTo.id, "id");
    replyToDbId = orig?.id ?? null;
  }

  let senderParticipantId: string | null = null;
  let senderName: string;
  let senderRole: string;
  if (senderOwnerUserId) {
    // Отправитель — наш сотрудник (владелец подключённого номера).
    const { data: participant } = await service.from("participants")
      .select("id, name, last_name")
      .eq("user_id", senderOwnerUserId).eq("workspace_id", workspaceId)
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
    waha_msg_core: wahaMsgCore(p.id), // дедуп по ядру: одно сообщение = одна запись
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

/** Добавить владельца сессии в участники треда (доступ к общей группе). Идемпотентно. */
async function ensureThreadMember(
  service: SupabaseClient, threadId: string, userId: string, workspaceId: string,
) {
  const { data: p } = await service.from("participants")
    .select("id").eq("user_id", userId).eq("workspace_id", workspaceId)
    .eq("is_deleted", false).maybeSingle();
  if (!p?.id) return;
  await service.from("project_thread_members")
    .upsert({ thread_id: threadId, participant_id: p.id },
      { onConflict: "thread_id,participant_id", ignoreDuplicates: true });
}

/** Голые цифры номера из jid («34643268407@c.us»/«…:18@s.whatsapp.net» → «34643268407»). */
function jidDigits(jid: string): string {
  return (jid.split("@")[0] ?? "").split(":")[0].replace(/\D/g, "");
}

/**
 * Свести waha_chat_id к телефону для склейки с Wazzup (тот ключует по телефону).
 *  - «<phone>@c.us» → телефон напрямую;
 *  - «<lid>@lid» (номер скрыт) → через WAHA `GET /lids/{lid}` → pn → телефон.
 * Null, если не резолвится (store не досинкался) — тогда склейки не будет, создастся новый тред.
 */
async function resolveWahaPhone(sessionName: string, chatId: string): Promise<string | null> {
  if (chatId.endsWith("@c.us")) return jidDigits(chatId) || null;
  if (chatId.endsWith("@lid") && WAHA_URL) {
    try {
      const res = await fetch(`${WAHA_URL}/api/${sessionName}/lids/${encodeURIComponent(chatId)}`,
        { headers: { "X-Api-Key": WAHA_API_KEY } });
      if (!res.ok) return null;
      const d = await res.json().catch(() => ({}));
      const pn = typeof d?.pn === "string" ? d.pn : null;
      return pn ? (jidDigits(pn) || null) : null;
    } catch { return null; }
  }
  return null;
}

/**
 * Общий тред для 1:1 переписки двух наших сотрудников (оба номера подключены).
 * Ключ — неупорядоченная пара телефонов; один тред на пару, оба в участниках.
 * Отправка разруливается в waha-send по автору (двунаправленно).
 */
async function ensurePairThread(
  service: SupabaseClient,
  a: {
    workspaceId: string; sessionId: string; chatId: string;
    ownPhone: string; ownOwnerUserId: string;
    colleaguePhone: string; colleagueOwnerUserId: string; fallbackName: string | null;
  },
): Promise<string> {
  const pairKey = [a.ownPhone, a.colleaguePhone].sort().join("_");
  const find = () => service.from("project_threads").select("id")
    .eq("workspace_id", a.workspaceId).eq("whatsapp_pair_key", pairKey)
    .eq("is_deleted", false).maybeSingle();

  let threadId: string | null = (await find()).data?.id as string ?? null;
  if (!threadId) {
    const { data: created, error } = await service.from("project_threads").insert({
      project_id: null,
      owner_user_id: a.ownOwnerUserId,
      workspace_id: a.workspaceId,
      name: a.fallbackName ?? "Коллега",
      type: "chat", access_type: "all",
      waha_session_id: a.sessionId, waha_chat_id: a.chatId, waha_group: false,
      whatsapp_pair_key: pairKey,
      icon: "whatsapp", accent_color: "emerald",
      created_by: a.ownOwnerUserId,
    }).select("id").single();
    threadId = (created?.id as string) ?? ((await find()).data?.id as string) ?? null;
    if (!threadId) throw new Error(`Failed to create pair thread: ${error?.message}`);
  }
  // Оба сотрудника — участники (видят общий тред).
  await ensureThreadMember(service, threadId, a.ownOwnerUserId, a.workspaceId);
  await ensureThreadMember(service, threadId, a.colleagueOwnerUserId, a.workspaceId);
  return threadId;
}

async function ensureWahaThread(
  service: SupabaseClient,
  a: {
    sessionId: string; sessionName: string; workspaceId: string; ownerUserId: string;
    chatId: string; isGroup: boolean; fallbackName: string | null; ownPhone: string;
  },
): Promise<string> {
  // Группа = ОДИН общий тред на воркспейс (ключ по группе, не по сессии) —
  // оба сотрудника из группы видят одну переписку. Личка — по паре сессия+чат.
  const findThread = () => {
    const q = service.from("project_threads").select("id");
    return (a.isGroup
      ? q.eq("workspace_id", a.workspaceId).eq("waha_chat_id", a.chatId).eq("waha_group", true)
      : q.eq("waha_session_id", a.sessionId).eq("waha_chat_id", a.chatId)
    ).eq("is_deleted", false).maybeSingle();
  };

  const { data: existing } = await findThread();
  if (existing) return existing.id as string;

  // Единый WhatsApp-тред по телефону: находим тред клиента (в т.ч. заведённый
  // через Wazzup ИЛИ через WAHA с другим форматом chat_id — @lid↔@c.us) и
  // переключаем его на WAHA. Только личка. Общий резолвер — _shared/whatsappThread.
  let phone: string | null = null;
  if (!a.isGroup) {
    phone = await resolveWahaPhone(a.sessionName, a.chatId);
    if (phone) {
      // Собеседник — наш подключённый номер? → ОДИН общий тред коллег по паре.
      if (a.ownPhone && phone !== a.ownPhone) {
        const colleagueOwner = await findConnectedNumberOwner(service, a.workspaceId, phone);
        if (colleagueOwner) {
          return await ensurePairThread(service, {
            workspaceId: a.workspaceId, sessionId: a.sessionId, chatId: a.chatId,
            ownPhone: a.ownPhone, ownOwnerUserId: a.ownerUserId,
            colleaguePhone: phone, colleagueOwnerUserId: colleagueOwner,
            fallbackName: a.fallbackName,
          });
        }
      }
      const wt = await findWhatsAppThreadByPhone(service, a.ownerUserId, phone);
      if (wt) {
        await bindThreadToWaha(service, wt.id, { sessionId: a.sessionId, chatId: a.chatId, phone });
        return wt.id;
      }
    }
  }

  // Имя: для группы пробуем реальное имя через WAHA, иначе fallback
  let displayName = a.fallbackName ?? (a.isGroup ? "Группа WhatsApp" : a.chatId);
  if (a.isGroup && WAHA_URL) {
    const groupName = await fetchGroupName(a.sessionName, a.chatId);
    if (groupName) displayName = groupName;
  }

  let contactId: string | null = null;
  if (!a.isGroup) {
    contactId = await ensureWahaContact(service, a.workspaceId, a.chatId, displayName);
  }

  const { data: created, error } = await service.from("project_threads").insert({
    project_id: null,
    owner_user_id: a.ownerUserId,
    contact_participant_id: contactId,
    workspace_id: a.workspaceId,
    name: displayName,
    type: "chat", access_type: "all",
    waha_session_id: a.sessionId, waha_chat_id: a.chatId, waha_group: a.isGroup,
    whatsapp_phone: phone, // канонический ключ (null для групп/непорезолвленных)
    icon: "whatsapp", accent_color: "emerald",
    created_by: a.ownerUserId,
  }).select("id").single();

  if (error || !created) {
    const { data: race } = await findThread();
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

/**
 * Контакт-собеседник WhatsApp. Для @c.us — по телефону; для @lid (номер скрыт)
 * — по синтетическому email waha-<lid>@no-email.local (иначе RPC вернёт NULL, т.к.
 * без идентификатора создавать контакт нечем). Идемпотентно.
 */
async function ensureWahaContact(
  service: SupabaseClient, workspaceId: string, fromJid: string, name: string | null,
): Promise<string | null> {
  if (!fromJid) return null;
  const local = fromJid.split("@")[0]?.split(":")[0] ?? "";
  const isPhone = fromJid.endsWith("@c.us");
  const { data: cid } = await service.rpc("find_or_create_contact_participant", {
    p_workspace_id: workspaceId,
    p_name: name ?? local ?? "Клиент",
    p_phone: isPhone ? local : null,
    p_email: !isPhone && local ? `waha-${local}@no-email.local` : null,
  });
  return (cid as string) ?? null;
}
