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
import { Api } from "telegram"
import { supabase } from "../db.js"
import { logger } from "../utils/logger.js"
import {
  ensureMTProtoThread,
  ensureSystemInboxProject,
  resolveSessionParticipantId,
} from "./inbox.js"

interface SessionContext {
  user_id: string
  workspace_id: string
  tg_user_id: number
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

  // Парсим имя/юзернейм клиента из chat (для имени треда). gramjs выдаёт
  // entity при первом обращении и кеширует; getEntity безопасен.
  let clientFirstName: string | null = null
  let clientLastName: string | null = null
  let clientUsername: string | null = null
  try {
    const entity = await event.client?.getEntity(peerUser)
    if (entity instanceof Api.User) {
      clientFirstName = entity.firstName ?? null
      clientLastName = entity.lastName ?? null
      clientUsername = entity.username ?? null
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

  // 4. Системный инбокс + тред под клиента.
  const projectId = await ensureSystemInboxProject({
    user_id: ctx.user_id,
    workspace_id: ctx.workspace_id,
  })
  const threadId = await ensureMTProtoThread({
    project_id: projectId,
    workspace_id: ctx.workspace_id,
    session_user_id: ctx.user_id,
    client_tg_user_id: clientTgUserId,
    client_display_name: clientDisplayName,
  })

  // 5. Дедуп через UNIQUE-индекс. Если сообщение уже в БД (нами отправленное
  // через /messages/send или повтор апдейта), 23505 — пропускаем.
  const senderParticipantId = isOutgoing
    ? await resolveSessionParticipantId({
        user_id: ctx.user_id,
        workspace_id: ctx.workspace_id,
      })
    : null

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

  const payload = {
    workspace_id: ctx.workspace_id,
    project_id: projectId,
    thread_id: threadId,
    sender_participant_id: senderParticipantId,
    sender_name: isOutgoing ? null : clientDisplayName,
    sender_role: isOutgoing ? null : "Клиент",
    content: msg.message || "(вложение)",
    source: "telegram_mtproto" as const,
    channel: "client" as const,
    telegram_chat_id: clientTgUserId,
    telegram_message_id: telegramMessageId,
    telegram_message_ids: [telegramMessageId],
    telegram_message_date: messageDateISO,
    telegram_sender_user_id: senderId,
    reply_to_message_id: replyToMessageId,
  }

  const { error } = await supabase.from("project_messages").insert(payload)
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      // Дубликат (мы сами уже вставили через /messages/send или повтор апдейта).
      return
    }
    logger.error("[incoming] insert error:", error)
  }
}
