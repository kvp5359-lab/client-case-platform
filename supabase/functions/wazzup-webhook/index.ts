/**
 * Edge Function: wazzup-webhook (v2 — с вложениями, edit/delete, статусами).
 *
 * Webhook от Wazzup24. Обрабатывает события:
 *  - messages[]            — входящие/исходящие (echo). Поддержка text + любых медиа
 *                            (image/video/audio/voice/document/sticker), плюс quotedMessage
 *                            для reply-lookup.
 *  - statuses[]            — статусы доставки sent/delivered/read/error. status='read'
 *                            обновляет recipient_read_at у исходящих.
 *  - channelsUpdates[]     — состояние канала.
 *  - { test: true }        — ping.
 *
 * Защита: секрет в query-string ?key=<webhook_secret> (Wazzup не поддерживает
 * custom-headers).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  okText, getServiceClient, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  isOutgoingEcho,
} from "../_shared/edge.ts";
import { storeAttachment } from "../_shared/storeAttachment.ts";

interface WazzupMessage {
  messageId: string;
  channelId: string;
  chatType: string;
  chatId: string;
  type: string;
  text?: string;
  contentUri?: string;
  isEcho?: boolean;
  dateTime?: string;
  authorName?: string;
  authorPhone?: string;
  contact?: { name?: string; avatarUri?: string; phone?: string; username?: string };
  status?: string;
  quotedMessage?: { messageId?: string };
}

interface WazzupStatus {
  messageId: string;
  status: "sent" | "delivered" | "read" | "error" | string;
  timestamp?: string;
  errorDescription?: string;
}

interface WazzupChannelUpdate {
  channelId: string;
  transport?: string;
  state?: string;
  name?: string;
}

interface WazzupWebhookPayload {
  test?: boolean;
  messages?: WazzupMessage[];
  statuses?: WazzupStatus[];
  channelsUpdates?: WazzupChannelUpdate[];
}

// Какие типы Wazzup-сообщений считаем медиа (требующими download).
const MEDIA_TYPES = new Set([
  "image", "video", "audio", "voice", "document", "sticker", "vcard", "geo",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return okText();
  if (req.method !== "POST") return okText();

  const url = new URL(req.url);
  const providedSecret = url.searchParams.get("key");
  if (!providedSecret) return new Response("forbidden", { status: 403 });

  const service = getServiceClient();

  const { data: settings } = await service
    .from("wazzup_settings")
    .select("workspace_id, webhook_secret")
    .eq("webhook_secret", providedSecret)
    .maybeSingle();

  if (!settings) {
    console.warn("[wazzup-webhook] unknown webhook secret");
    return new Response("forbidden", { status: 403 });
  }

  let payload: WazzupWebhookPayload;
  try { payload = await req.json() as WazzupWebhookPayload; }
  catch { return okText(); }

  if (payload.test) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  try {
    if (payload.messages?.length) {
      for (const msg of payload.messages) {
        await handleIncomingMessage(service, settings.workspace_id, msg);
      }
    }
    if (payload.statuses?.length) {
      for (const st of payload.statuses) {
        await handleStatus(service, st);
      }
    }
    if (payload.channelsUpdates?.length) {
      for (const ch of payload.channelsUpdates) {
        await handleChannelUpdate(service, settings.workspace_id, ch);
      }
    }
  } catch (err) {
    console.error("[wazzup-webhook] handler error:", err);
  }

  return okText();
});

// ===========================================================================
// Входящие сообщения
// ===========================================================================

async function handleIncomingMessage(
  service: SupabaseClient,
  workspaceId: string,
  msg: WazzupMessage,
): Promise<void> {
  // 0. Dedup: не наша ли это echo? Если messageId есть в общей таблице
  // dedup — пропускаем (мы уже отрисовали её в нашем UI). Покрывает
  // эмодзи-реакции и доп. файлы из multi-file отправки.
  if (msg.isEcho && await isOutgoingEcho(service, "wazzup", msg.messageId)) {
    return;
  }

  // 1. Канал
  const { data: channel } = await service
    .from("wazzup_channels")
    .select("id, user_id, transport, name, phone")
    .eq("workspace_id", workspaceId)
    .eq("channel_id", msg.channelId)
    .maybeSingle();

  if (!channel) {
    console.warn(`[wazzup-webhook] unknown channelId=${msg.channelId} ws=${workspaceId}`);
    return;
  }
  if (!channel.user_id) {
    console.warn(`[wazzup-webhook] channel ${msg.channelId} not assigned to a user yet`);
    return;
  }

  // 3. Имя клиента: contact.name (приоритет) > authorName > username > phone > chatId
  const clientName =
    msg.contact?.name?.trim() ||
    msg.authorName?.trim() ||
    msg.contact?.username ||
    msg.contact?.phone ||
    msg.chatId;

  // 4. Сначала смотрим существующий тред (один на клиента в рамках канала).
  let projectId: string | null = null;
  let threadId: string;
  const { data: existingThread } = await service
    .from("project_threads")
    .select("id, project_id")
    .eq("wazzup_channel_id", channel.id as string)
    .eq("wazzup_chat_id", msg.chatId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (existingThread) {
    projectId = existingThread.project_id as string;
    threadId = existingThread.id as string;
  } else if (!msg.isEcho) {
    // Этап 9 CRM-фрейма: первое входящее от клиента — пробуем CRM-роутинг.
    // Echo (исходящее с телефона сотрудника) → в системный инбокс по-старому.
    const channelType = msg.chatType === "instagram" ? "instagram" : "phone";
    const { data: routed } = await service.rpc("route_incoming_to_project", {
      p_workspace_id: workspaceId,
      p_source: "wazzup",
      p_channel_type: channelType,
      p_external_id: msg.chatId,
      p_sender_name: clientName,
      p_thread_name: clientName,
    });
    const r = Array.isArray(routed) ? routed[0] : routed;
    if (r?.project_id && r?.thread_id) {
      projectId = r.project_id as string;
      threadId = r.thread_id as string;
      // Дописываем wazzup-метаданные на тред — чтобы ответы и реакции находили его.
      await service.from("project_threads").update({
        wazzup_channel_id: channel.id as string,
        wazzup_chat_id: msg.chatId,
        wazzup_chat_type: msg.chatType,
        icon: "whatsapp",
        accent_color: "emerald",
        name: clientName,
      }).eq("id", threadId);
      console.log(`[wazzup-webhook] CRM routed (${r.status}) → project ${projectId}, thread ${threadId}`);
    } else {
      // 'no_template' / disabled CRM → fallback в личные диалоги (без проекта).
      threadId = await ensureWazzupThread(service, {
        ownerUserId: channel.user_id, workspaceId,
        channelDbId: channel.id as string,
        chatId: msg.chatId,
        chatType: msg.chatType,
        clientName,
      });
      projectId = null;
    }
  } else {
    // Echo (сотрудник с телефона) — личные диалоги, без проекта.
    threadId = await ensureWazzupThread(service, {
      ownerUserId: channel.user_id, workspaceId,
      channelDbId: channel.id as string,
      chatId: msg.chatId,
      chatType: msg.chatType,
      clientName,
    });
    projectId = null;
  }

  // Если тред уже был и имя клиента изменилось/уточнилось — апдейтнем.
  await service.from("project_threads")
    .update({ name: clientName })
    .eq("id", threadId)
    .eq("name", msg.chatId); // только если имя сейчас = телефон-fallback

  // 5. Контент: text/caption.
  // Для медиа (если text пустой) ставим временный плейсхолдер «📎», как в TG.
  // После скачивания, если файл загрузился, плейсхолдер остаётся (UI покажет
  // attachment) — это совместимо с has_attachments-логикой.
  const isMedia = MEDIA_TYPES.has(msg.type) && msg.contentUri;
  const rawContent = (msg.text ?? "").trim();
  const content = rawContent || (isMedia ? "📎" : `[${msg.type}]`);

  // 6. Reply-lookup по wazzup_message_id оригинала.
  let replyToDbId: string | null = null;
  if (msg.quotedMessage?.messageId) {
    const { data: replyRow } = await service
      .from("project_messages")
      .select("id")
      .eq("wazzup_message_id", msg.quotedMessage.messageId)
      .maybeSingle();
    replyToDbId = replyRow?.id ?? null;
  }

  // 7. Sender attribution. isEcho=true → сообщение от сотрудника (с его телефона/др. устройства).
  let senderParticipantId: string | null = null;
  let senderName: string;
  let senderRole: string;

  if (msg.isEcho) {
    const { data: participant } = await service
      .from("participants")
      .select("id, name, last_name")
      .eq("user_id", channel.user_id)
      .eq("workspace_id", workspaceId)
      .eq("is_deleted", false)
      .maybeSingle();
    senderParticipantId = participant?.id ?? null;
    senderName = participant
      ? [participant.name, participant.last_name].filter(Boolean).join(" ").trim()
      : "Сотрудник";
    senderRole = "Сотрудник";
  } else {
    senderName = clientName;
    senderRole = "Клиент";
  }

  // 8. INSERT сообщения с has_attachments=true для медиа.
  const insertPayload = {
    project_id: projectId,
    workspace_id: workspaceId,
    sender_participant_id: senderParticipantId,
    sender_name: senderName,
    sender_role: senderRole,
    content,
    source: "wazzup",
    channel: "client",
    thread_id: threadId,
    wazzup_message_id: msg.messageId,
    wazzup_status: msg.status ?? null,
    reply_to_message_id: replyToDbId,
    has_attachments: !!isMedia,
  };

  const { data: inserted, error } = await service
    .from("project_messages")
    .insert(insertPayload)
    .select("id")
    .single();

  // 23505 = unique violation — webhook повторился, эту строку уже записали.
  if (error) {
    if (error.code !== "23505") console.error("[wazzup-webhook] insert error:", error);
    return;
  }

  const messageId = inserted.id as string;

  // 9. Скачивание медиа.
  if (isMedia && msg.contentUri) {
    await downloadAndAttach(service, {
      messageId, workspaceId, projectId,
      contentUri: msg.contentUri,
      mimeTypeHint: guessMimeFromType(msg.type),
      mediaType: msg.type,
    });

    // 10. Авто-транскрипция voice/audio.
    if (msg.type === "voice" || msg.type === "audio") {
      // fire-and-forget: транскрипция может занять секунды, не блокируем webhook
      transcribeFirstAttachment(messageId).catch(
        (e) => console.warn("[wazzup-webhook] transcribe failed:", e),
      );
    }
  }
}

// ===========================================================================
// Скачивание contentUri в Storage + INSERT в message_attachments
// ===========================================================================

async function downloadAndAttach(
  service: SupabaseClient,
  args: {
    messageId: string;
    workspaceId: string;
    projectId: string | null;
    contentUri: string;
    mimeTypeHint: string;
    mediaType: string;
  },
): Promise<void> {
  try {
    const res = await fetch(args.contentUri);
    if (!res.ok) {
      console.warn(`[wazzup-webhook] download failed ${res.status} for ${args.contentUri}`);
      return;
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? args.mimeTypeHint;
    const fileName = guessFileName(args.contentUri, args.mediaType, contentType);
    await storeAttachment(service, {
      buffer, mimeType: contentType, fileName,
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      messageId: args.messageId,
    });
  } catch (err) {
    console.error("[wazzup-webhook] download/attach error:", err);
  }
}

function guessFileName(contentUri: string, mediaType: string, contentType: string): string {
  // Wazzup даёт contentUri вида https://wazzup24.com/.../something.jpg или signed.
  const lastSeg = contentUri.split("?")[0].split("/").pop() || "";
  if (lastSeg && lastSeg.includes(".")) return lastSeg;
  const ext = mimeToExt(contentType) ?? defaultExtForType(mediaType);
  return `${mediaType}_${Date.now()}.${ext}`;
}

function mimeToExt(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/aac": "aac", "audio/wav": "wav",
    "application/pdf": "pdf", "application/zip": "zip",
  };
  return map[mime] ?? null;
}

function defaultExtForType(t: string): string {
  switch (t) {
    case "image": return "jpg";
    case "video": return "mp4";
    case "voice": return "ogg";
    case "audio": return "mp3";
    case "sticker": return "webp";
    case "document": return "bin";
    default: return "bin";
  }
}

function guessMimeFromType(t: string): string {
  switch (t) {
    case "image": return "image/jpeg";
    case "video": return "video/mp4";
    case "voice": return "audio/ogg";
    case "audio": return "audio/mpeg";
    case "sticker": return "image/webp";
    default: return "application/octet-stream";
  }
}

// ===========================================================================
// Авто-транскрипция voice/audio (fire-and-forget)
// ===========================================================================

async function transcribeFirstAttachment(messageId: string): Promise<void> {
  // Фоном дёргаем существующую функцию transcribe-audio с service-ключом.
  const service = getServiceClient();
  const { data: attachment } = await service
    .from("message_attachments")
    .select("id")
    .eq("message_id", messageId)
    .limit(1)
    .maybeSingle();
  if (!attachment) return;

  await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ attachment_id: attachment.id }),
  });
}

// ===========================================================================
// Статусы доставки
// ===========================================================================

async function handleStatus(service: SupabaseClient, st: WazzupStatus): Promise<void> {
  const update: Record<string, unknown> = { wazzup_status: st.status };

  // status='read' от Wazzup → клиент прочитал наше исходящее. Стампим
  // recipient_read_at, чтобы UI показал «прочитано».
  if (st.status === "read") {
    update.recipient_read_at = st.timestamp
      ? new Date(st.timestamp).toISOString()
      : new Date().toISOString();
  }

  await service
    .from("project_messages")
    .update(update)
    .eq("wazzup_message_id", st.messageId);
}

// ===========================================================================
// Обновления канала (state)
// ===========================================================================

async function handleChannelUpdate(
  service: SupabaseClient,
  workspaceId: string,
  ch: WazzupChannelUpdate,
): Promise<void> {
  await service
    .from("wazzup_channels")
    .update({
      state: ch.state ?? null,
      transport: ch.transport ?? undefined,
      name: ch.name ?? undefined,
      last_synced_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspaceId)
    .eq("channel_id", ch.channelId);
}

// ===========================================================================
// Helpers: Wazzup-тред (личный диалог сотрудника, без проекта)
// ===========================================================================

async function ensureWazzupThread(
  service: SupabaseClient,
  args: {
    ownerUserId: string;
    workspaceId: string;
    channelDbId: string;
    chatId: string;
    chatType: string;
    clientName: string;
  },
): Promise<string> {
  const { data: existing } = await service.from("project_threads")
    .select("id")
    .eq("wazzup_channel_id", args.channelDbId)
    .eq("wazzup_chat_id", args.chatId)
    .eq("is_deleted", false).maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await service.from("project_threads").insert({
    project_id: null,
    owner_user_id: args.ownerUserId,
    workspace_id: args.workspaceId,
    name: args.clientName,
    type: "chat", access_type: "all",
    wazzup_channel_id: args.channelDbId,
    wazzup_chat_id: args.chatId,
    wazzup_chat_type: args.chatType,
    icon: "whatsapp", accent_color: "emerald",
    created_by: args.ownerUserId,
  }).select("id").single();
  if (error || !created) throw new Error(`Failed to create wazzup thread: ${error?.message}`);
  return created.id as string;
}
