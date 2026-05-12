/**
 * Обработчик входящих сообщений в личных чатах сотрудника.
 *
 * Срабатывает на:
 *  - сообщения от клиента (msg.out === false);
 *  - исходящие, отправленные сотрудником с другого устройства (out === true).
 *
 * Не срабатывает на:
 *  - групповые чаты — фильтр по chat.type !== 'private';
 *  - сообщения, которые мы сами отправили через /messages/send — мы их
 *    уже записали в БД, дедуп по (thread_id, telegram_message_id).
 */

import type { NewMessageEvent } from "telegram/events/NewMessage.js"
import { Api, TelegramClient } from "telegram"
import { randomBytes } from "node:crypto"
import { supabase } from "../db.js"
import { logger } from "../utils/logger.js"
import {
  ensureClientParticipant,
  ensureMTProtoThread,
  resolveSessionParticipant,
} from "./inbox.js"

interface SessionContext {
  user_id: string
  workspace_id: string
  tg_user_id: number
}

/**
 * In-process сериализатор по `(threadId, groupedId)`. Альбом Telegram
 * приходит как N updateNewMessage в течение ~10мс — без mutex'а они
 * конкурентно выполняют SELECT-then-INSERT и создают N дублей вместо
 * одной склеенной записи. Promise-цепочка гарантирует, что внутри одной
 * пары (тред, альбом) обработка идёт строго последовательно.
 */
const albumLocks = new Map<string, Promise<void>>()

async function withAlbumLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = albumLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((r) => { release = r })
  albumLocks.set(key, prev.then(() => next))
  try {
    await prev
    return await fn()
  } finally {
    release()
    // Чистим Map чтобы не утекало.
    if (albumLocks.get(key) === next || albumLocks.get(key) === prev.then(() => next)) {
      albumLocks.delete(key)
    }
  }
}

export async function handleNewMessage(
  ctx: SessionContext,
  event: NewMessageEvent,
): Promise<void> {
  const msg = event.message
  if (!msg) return

  // 1. Только private chats. groups/supergroups/channels отдаём бот-каналу.
  // У gramjs у Message есть isPrivate (через peerId.userId).
  const peerUser = msg.peerId instanceof Api.PeerUser ? msg.peerId : null
  if (!peerUser) return

  // Если это альбом — сериализуем обработку всех его элементов: иначе
  // конкурентные SELECT-then-INSERT создают N дублей вместо одной склейки.
  const groupedIdEarly = msg.groupedId ? Number(msg.groupedId) : null
  if (groupedIdEarly !== null) {
    const lockKey = `${ctx.user_id}:${Number(peerUser.userId)}:${groupedIdEarly}`
    return withAlbumLock(lockKey, () => handleNewMessageInner(ctx, event, msg, peerUser))
  }
  return handleNewMessageInner(ctx, event, msg, peerUser)
}

async function handleNewMessageInner(
  ctx: SessionContext,
  event: NewMessageEvent,
  msg: Api.Message,
  peerUser: Api.PeerUser,
): Promise<void> {
  if (!event.client) return
  await ingestMtprotoMessage({
    ctx,
    client: event.client,
    msg,
    peerUser,
  })
}

/**
 * Общая логика «положить одно сообщение Telegram в БД + скачать медиа +
 * обновить participant'а и аватар». Вызывается из двух мест:
 *   1) realtime handleNewMessage — на каждый апдейт от gramjs;
 *   2) backfill endpoint — на каждое сообщение, вернувшееся из getHistory.
 *
 * Idempotent через UNIQUE (thread_id, telegram_message_id, source).
 * При попытке вставить дубль — возвращает { skipped: true }.
 */
export async function ingestMtprotoMessage(args: {
  ctx: SessionContext
  client: TelegramClient
  msg: Api.Message
  /** peer треда (PeerUser клиента); для realtime берётся из event, для backfill — строится */
  peerUser: Api.PeerUser
  /**
   * Если true — это историческое сообщение из бэкфилла. Тогда `created_at`
   * у новой строки project_messages будет равен `telegram_message_date`,
   * а не `now()`. Без этого исторические сообщения попадают в конец ленты,
   * считаются непрочитанными и триггерят тосты — потому что унифицированная
   * сортировка/непрочитанность/toast — все смотрят на `created_at`.
   */
  backfill?: boolean
}): Promise<{ inserted: boolean; messageId?: string }> {
  const { ctx, msg, peerUser, client, backfill = false } = args

  // 2. Идентификатор клиента (другой стороны) и направление.
  // В личке peerId.userId — это **всегда** id «собеседника», не нашего юзера,
  // даже для исходящих. И флаг msg.out=true означает «я отправил», msg.out=false — «получил».
  const clientTgUserId = Number(peerUser.userId)
  const isOutgoing = msg.out === true
  const senderId = msg.fromId
    ? msg.fromId instanceof Api.PeerUser
      ? Number(msg.fromId.userId)
      : null
    : isOutgoing ? ctx.tg_user_id : clientTgUserId

  // Парсим имя/юзернейм клиента. Перебираем несколько источников — gramjs
  // не всегда сразу резолвит peerUser через getEntity (для новых контактов
  // access_hash может быть ещё не в кеше). Пробуем по убыванию надёжности:
  //   1) msg.getSender() — gramjs внутри использует кешированный sender, если есть
  //   2) event.client.getEntity(peerUser) — старый путь
  //   3) event.client.getEntity(msg.fromId) — если fromId присутствует
  let clientFirstName: string | null = null
  let clientLastName: string | null = null
  let clientUsername: string | null = null
  const tryReadUser = (entity: unknown): boolean => {
    if (entity instanceof Api.User) {
      clientFirstName = entity.firstName ?? null
      clientLastName = entity.lastName ?? null
      clientUsername = entity.username ?? null
      return !!(clientFirstName || clientLastName || clientUsername)
    }
    return false
  }
  try {
    const sender = await msg.getSender()
    if (tryReadUser(sender)) {
      /* got name */
    } else {
      const entity = await client.getEntity(peerUser)
      if (!tryReadUser(entity) && msg.fromId) {
        const fromEntity = await client.getEntity(msg.fromId)
        tryReadUser(fromEntity)
      }
    }
  } catch (_) {
    /* peer не зарезолвился — используем fallback ниже */
  }
  const clientDisplayName =
    [clientFirstName, clientLastName].filter(Boolean).join(" ") ||
    (clientUsername ? `@${clientUsername}` : `tg:${clientTgUserId}`)

  // 3. Проверка дедупа: возможно, это эхо от нашего же /messages/send.
  // У отправленного нами сообщения уже есть строка с этим telegram_message_id.
  const telegramMessageId = Number(msg.id)
  const messageDateISO = msg.date ? new Date(msg.date * 1000).toISOString() : null

  // 4. Тред без проекта (project_id=NULL + owner_user_id).
  // Архитектура «Личные диалоги»: треды не сидят в фейковом
  // системном проекте, а живут как workspace-level бесхозные.
  const threadId = await ensureMTProtoThread({
    workspace_id: ctx.workspace_id,
    session_user_id: ctx.user_id,
    client_tg_user_id: clientTgUserId,
    client_display_name: clientDisplayName,
  })

  // 5. Дедуп через UNIQUE-индекс. Если сообщение уже в БД (нами отправленное
  // через /messages/send или повтор апдейта), 23505 — пропускаем.
  const clientParticipantId = await ensureClientParticipant({
    workspace_id: ctx.workspace_id,
    telegram_user_id: clientTgUserId,
    first_name: clientFirstName,
    last_name: clientLastName,
  })

  // Fire-and-forget: загрузить аватар клиента, если его ещё нет в participant.
  // Bot API не работает для MTProto — только клиентский gramjs может
  // достать profile photo. Делаем здесь, потому что entity клиента сейчас
  // в gramjs cache (только что сделали getEntity выше).
  if (clientParticipantId) {
    void fetchAndStoreAvatar(client, {
      participantId: clientParticipantId,
      clientTgUserId,
      peerUser,
    }).catch((err) => logger.warn({ err, clientTgUserId }, "avatar fetch failed"))
  }
  const sessionParticipant = isOutgoing
    ? await resolveSessionParticipant({
        user_id: ctx.user_id,
        workspace_id: ctx.workspace_id,
      })
    : null
  const senderParticipantId = isOutgoing
    ? sessionParticipant?.id ?? null
    : clientParticipantId

  // Reply lookup: если в апдейте есть reply_to — ищем оригинал в нашей БД.
  let replyToMessageId: string | null = null
  const replyToTgMsgId = msg.replyTo instanceof Api.MessageReplyHeader
    ? Number(msg.replyTo.replyToMsgId ?? 0) || null
    : null
  if (replyToTgMsgId) {
    const { data: original } = await supabase
      .from("project_messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("telegram_message_id", replyToTgMsgId)
      .maybeSingle()
    if (original) replyToMessageId = original.id as string
  }

  // Определяем медиа: документ (файл/voice/video) или фото.
  const mediaInfo = extractMediaInfo(msg)
  const groupedId = msg.groupedId ? Number(msg.groupedId) : null

  // Если это часть альбома — пытаемся приклеиться к уже существующему
  // project_message с тем же groupedId (другая половина альбома пришла
  // раньше). Это даёт одну карточку с несколькими вложениями.
  let inserted: { id: string } | null = null
  if (groupedId !== null && mediaInfo) {
    const { data: existing } = await supabase
      .from("project_messages")
      .select("id, content, telegram_message_ids")
      .eq("thread_id", threadId)
      .eq("telegram_grouped_id", groupedId)
      .maybeSingle()
    if (existing) {
      // Дописываем telegram_message_id в массив, обновляем caption если
      // в этом элементе он есть, а у предыдущего был "📎".
      const ids = Array.isArray(existing.telegram_message_ids)
        ? (existing.telegram_message_ids as number[])
        : []
      if (!ids.includes(telegramMessageId)) {
        ids.push(telegramMessageId)
      }
      const update: Record<string, unknown> = { telegram_message_ids: ids }
      if (msg.message && (existing.content === "📎" || !existing.content)) {
        update.content = msg.message
      }
      await supabase
        .from("project_messages")
        .update(update)
        .eq("id", existing.id)
      inserted = { id: existing.id as string }
      // Альбом — это «приклеивание к существующему». Считаем как «вставили»
      // только если на самом деле добавили telegram_message_id в массив.
    }
  }

  if (!inserted) {
    const payload: Record<string, unknown> = {
      workspace_id: ctx.workspace_id,
      project_id: null,
      thread_id: threadId,
      sender_participant_id: senderParticipantId,
      sender_name: isOutgoing
        ? sessionParticipant?.name ?? "Сотрудник"
        : clientDisplayName,
      sender_role: isOutgoing ? "Сотрудник" : "Клиент",
      content: msg.message || (mediaInfo ? "📎" : "(вложение)"),
      source: "telegram_mtproto" as const,
      channel: "client" as const,
      has_attachments: mediaInfo !== null,
      telegram_chat_id: clientTgUserId,
      telegram_message_id: telegramMessageId,
      telegram_message_ids: [telegramMessageId],
      telegram_message_date: messageDateISO,
      telegram_sender_user_id: senderId,
      reply_to_message_id: replyToMessageId,
      telegram_grouped_id: groupedId,
    }
    // Backfill: ставим created_at = telegram_message_date, чтобы сообщения
    // встали в ленту хронологически, не считались непрочитанными и не
    // дёргали toast/sound через realtime-подписку.
    if (backfill && messageDateISO) {
      payload.created_at = messageDateISO
    }

    const { data: row, error } = await supabase
      .from("project_messages")
      .insert(payload)
      .select("id")
      .single()
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        // Дубликат — наше же исходящее или повтор апдейта/бэкфилла.
        return { inserted: false }
      }
      logger.error("[incoming] insert error:", error)
      return { inserted: false }
    }
    inserted = row as { id: string } | null
  }

  // Если есть медиа — качаем через gramjs, кладём в Storage, создаём строку
  // в message_attachments. UI после реалтайма подтянет вложение.
  if (mediaInfo && inserted) {
    try {
      await downloadAndStoreMedia({
        client,
        message: msg,
        info: mediaInfo,
        workspaceId: ctx.workspace_id,
        threadId,
        messageId: inserted.id as string,
      })
    } catch (err) {
      logger.error("[incoming] media download failed:", err)
    }
  }

  return { inserted: !!inserted, messageId: inserted?.id }
}

interface MediaInfo {
  fileName: string
  fileSize: number
  mimeType: string | null
}

function extractMediaInfo(msg: Api.Message): MediaInfo | null {
  const media = msg.media
  if (!media) return null

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document
    let fileName = `file_${Number(doc.id)}`
    const mimeType: string | null = doc.mimeType ?? null
    for (const a of doc.attributes ?? []) {
      if (a instanceof Api.DocumentAttributeFilename) fileName = a.fileName
    }
    // Если у документа нет расширения, но есть mime — добавим.
    if (!fileName.includes(".") && mimeType) {
      const ext = mimeExtension(mimeType)
      if (ext) fileName = `${fileName}.${ext}`
    }
    return {
      fileName,
      fileSize: Number(doc.size),
      mimeType,
    }
  }

  if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
    return {
      fileName: `photo_${Number(media.photo.id)}.jpg`,
      fileSize: 0, // считается после скачивания
      mimeType: "image/jpeg",
    }
  }

  return null
}

function mimeExtension(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  }
  return map[mime] ?? null
}

async function downloadAndStoreMedia(args: {
  client: TelegramClient
  message: Api.Message
  info: MediaInfo
  workspaceId: string
  threadId: string
  messageId: string
}): Promise<void> {
  const buffer = await args.client.downloadMedia(args.message)
  if (!buffer || !(buffer instanceof Buffer)) {
    throw new Error("downloadMedia returned no data")
  }

  const ext = args.info.fileName.includes(".")
    ? args.info.fileName.split(".").pop()!
    : "bin"
  const random = randomBytes(4).toString("hex")
  // У личных диалогов нет project_id, используем thread_id в storage path,
  // чтобы вложения не сваливались в одну папку «null» и были привязаны
  // к треду.
  const storagePath = `${args.workspaceId}/${args.threadId}/${args.messageId}/${Date.now()}-${random}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("message-attachments")
    .upload(storagePath, buffer, {
      contentType: args.info.mimeType ?? "application/octet-stream",
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const { error: insertError } = await supabase.from("message_attachments").insert({
    message_id: args.messageId,
    file_name: args.info.fileName,
    file_size: args.info.fileSize > 0 ? args.info.fileSize : buffer.length,
    mime_type: args.info.mimeType,
    storage_path: storagePath,
  })
  if (insertError) {
    throw new Error(`message_attachments insert failed: ${insertError.message}`)
  }
}

/**
 * Качает profile photo клиента через gramjs и сохраняет URL в participants.
 * Идемпотентно: пропускает, если у participant'а уже есть avatar_url.
 * Вызывается fire-and-forget из handleNewMessage.
 */
async function fetchAndStoreAvatar(
  client: import("telegram").TelegramClient,
  args: {
    participantId: string
    clientTgUserId: number
    peerUser: Api.PeerUser
  },
): Promise<void> {
  const { data: row } = await supabase
    .from("participants")
    .select("avatar_url")
    .eq("id", args.participantId)
    .maybeSingle()
  if (row?.avatar_url) return // уже есть

  const entity = await client.getEntity(args.peerUser)
  const hasPhoto = entity && "photo" in entity &&
    entity.photo && entity.photo.className !== "UserProfilePhotoEmpty"
  if (!hasPhoto) return

  const buf = await client.downloadProfilePhoto(entity, { isBig: true })
  if (!buf || (buf as Buffer).length === 0) return

  const path = `tg/${args.clientTgUserId}.jpg`
  const { error: upErr } = await supabase.storage
    .from("participant-avatars")
    .upload(path, buf as Buffer, {
      contentType: "image/jpeg",
      upsert: true,
    })
  if (upErr) {
    logger.warn({ err: upErr, clientTgUserId: args.clientTgUserId }, "avatar storage upload failed")
    return
  }
  const { data: pub } = supabase.storage
    .from("participant-avatars")
    .getPublicUrl(path)
  const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`

  await supabase
    .from("participants")
    .update({ avatar_url: avatarUrl })
    .eq("id", args.participantId)
}
