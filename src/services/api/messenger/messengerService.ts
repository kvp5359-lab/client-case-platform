/**
 * Messenger service — core types, message CRUD, and re-exports from sub-services
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import { uploadAttachments } from './messengerAttachmentService'
import {
  MESSAGE_SELECT,
  castToProjectMessage,
  castToProjectMessages,
  hydrateReplyMessages,
} from './messengerService.helpers'

// Re-export sub-services for backwards compatibility
export {
  uploadAttachments,
  getAttachmentUrl,
  downloadAttachmentBlob,
  downloadAttachmentAsFile,
} from './messengerAttachmentService'
export { toggleReaction } from './messengerReactionService'
export {
  markAsRead,
  markAsUnread,
  getLastReadAt,
  getUnreadCount,
} from './messengerReadStatusService'
export {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
} from './messengerParticipantService'
export {
  saveDraftMessage,
  updateDraftMessage,
  publishDraftMessage,
  type SaveDraftParams,
} from './messengerDraftService'

// =====================================================
// Types (перенесены в messengerService.types.ts — чтобы под-сервисы
// могли импортировать типы без цикла через messengerService)
// =====================================================

export type {
  MessageChannel,
  MessageReaction,
  ReplyMessage,
  ProjectMessage,
  EmailMetadata,
  MessageAttachment,
  ForwardedAttachment,
} from './messengerService.types'
import type {
  MessageChannel,
  ProjectMessage,
  ForwardedAttachment,
} from './messengerService.types'

export interface SendMessageParams {
  /**
   * project_id — опционален для standalone-тредов без проекта (задач, созданных
   * вне проекта). Для обычных чатов проекта проставляется, чтобы RLS-политики
   * по project_participants работали.
   */
  projectId?: string
  workspaceId: string
  content: string
  senderParticipantId: string
  senderName: string
  senderRole: string | null
  replyToMessageId?: string | null
  attachments?: File[]
  /** Пересылаемые вложения — создают ссылки на существующие файлы без повторной загрузки */
  forwardedAttachments?: ForwardedAttachment[]
  /**
   * Legacy channel marker — остаётся для обратной совместимости БД и Telegram-bridge,
   * но не используется для выбора кеша на фронте (см. audit S1).
   */
  channel?: MessageChannel
  /** Тред, в который пишется сообщение. Обязателен — legacy-режим без треда удалён. */
  threadId: string
}

// Internal helpers (MESSAGE_SELECT, castToProjectMessage, castToProjectMessages,
// hydrateReplyMessages) вынесены в messengerService.helpers.ts — импортируются выше.

// =====================================================
// Message CRUD
// =====================================================

/**
 * Load a page of messages in a thread (cursor pagination, newest first).
 *
 * Раньше функция умела работать и в legacy-режиме по (projectId, channel),
 * но все треды в базе имеют thread_id, и все callers фронта всегда передают
 * threadId. Legacy-ветка удалена — см. audit S1.
 */
export async function getMessages(
  threadId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 50

  let query = supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (options.before) {
    query = query.lt('created_at', options.before)
  }

  const { data, error } = await query

  if (error) throw new ConversationError(`Ошибка загрузки сообщений: ${error.message}`)

  const messages = castToProjectMessages(data ?? [])
  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  await hydrateReplyMessages(messages)

  return { messages: messages.reverse(), hasMore }
}

/**
 * Загрузить сообщения проекта по каналу (`client` / `internal`) для AI-агрегации.
 *
 * Отличается от getMessages: фильтрует по project_id + channel вместо thread_id,
 * потому что AI-ассистент показывает переписку проекта целиком, через все треды
 * канала. Используется только в ProjectAiChat — обычный чат/мессенджер грузит
 * через getMessages(threadId).
 */
export async function getProjectMessagesByChannel(
  projectId: string,
  channel: MessageChannel,
  options: { limit?: number } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 50

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('project_id', projectId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (error) throw new ConversationError(`Ошибка загрузки сообщений: ${error.message}`)

  const messages = castToProjectMessages(data ?? [])
  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  await hydrateReplyMessages(messages)

  return { messages: messages.reverse(), hasMore }
}

/**
 * Загрузить сообщения проекта по списку тредов (или все треды проекта, если threadIds=null).
 * Используется AI-ассистентом для скоупа поиска по чатам.
 */
export async function getProjectMessages(
  projectId: string,
  threadIds: string[] | null,
  options: { limit?: number } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 200

  if (threadIds && threadIds.length === 0) {
    return { messages: [], hasMore: false }
  }

  let query = supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (threadIds) {
    query = query.in('thread_id', threadIds)
  }

  const { data, error } = await query

  if (error) throw new ConversationError(`Ошибка загрузки сообщений: ${error.message}`)

  const messages = castToProjectMessages(data ?? [])
  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  await hydrateReplyMessages(messages)

  return { messages: messages.reverse(), hasMore }
}

/**
 * Send a message (with optional attachments).
 *
 * Split-behavior: если есть текст И 2+ вложений — пишем в БД два отдельных
 * `project_messages`: один с текстом, второй с файлами. Оба идут в тред
 * последовательно, каждый со своими реакциями. Это повторяет структуру TG,
 * где альбом и сопроводительный текст — тоже два разных сообщения.
 * Для одного файла + текста пишем одну запись, текст уходит как caption.
 */
export async function sendMessage(params: SendMessageParams): Promise<ProjectMessage> {
  const channel = params.channel ?? 'client'

  const totalAttachments =
    (params.attachments?.length ?? 0) + (params.forwardedAttachments?.length ?? 0)
  const hasText =
    !!params.content &&
    params.content.trim() !== '' &&
    params.content !== '<p></p>' &&
    params.content !== '📎'
  const shouldSplit = hasText && totalAttachments >= 2

  const commonFields = {
    ...(params.projectId ? { project_id: params.projectId } : {}),
    workspace_id: params.workspaceId,
    sender_participant_id: params.senderParticipantId,
    sender_name: params.senderName,
    sender_role: params.senderRole,
    source: 'web' as const,
    channel,
    thread_id: params.threadId,
  }

  let textRowId: string | null = null

  // Split: сначала пишем текст — триггер БД сам отправит его как отдельное
  // TG-сообщение. Потом ниже создаётся вторая запись с файлами.
  if (shouldSplit) {
    const { data: textRow, error: textErr } = await supabase
      .from('project_messages')
      .insert({
        ...commonFields,
        content: params.content,
        reply_to_message_id: params.replyToMessageId ?? null,
        has_attachments: false,
      })
      .select('id')
      .single()
    if (textErr) throw new ConversationError(`Ошибка отправки сообщения: ${textErr.message}`)
    textRowId = textRow.id
  }

  const { data, error } = await supabase
    .from('project_messages')
    .insert({
      ...commonFields,
      // В split-варианте текст уже в отдельной записи — здесь placeholder 📎,
      // который UI (MessageBubble) скрывает, а edge function трактует как
      // «только вложения без caption». Пустую строку БД не принимает (CHECK).
      content: shouldSplit ? '📎' : params.content,
      // Reply-to цепляем к текстовой записи (если split — к текстовой, иначе
      // к первой и единственной).
      reply_to_message_id: shouldSplit ? null : params.replyToMessageId ?? null,
      has_attachments: totalAttachments > 0,
    })
    .select('*')
    .single()

  if (error) throw new ConversationError(`Ошибка отправки сообщения: ${error.message}`)

  let message = castToProjectMessage({
    ...data,
    reply_to_message: null,
    reactions: [],
    attachments: [],
  })

  if (params.attachments && params.attachments.length > 0) {
    await uploadAttachments(params.attachments, message.id, params.workspaceId, params.projectId ?? '')
  }

  // Пересылаемые вложения — создаём ссылки на существующие файлы без загрузки
  if (params.forwardedAttachments && params.forwardedAttachments.length > 0) {
    const rows = params.forwardedAttachments.map((att) => ({
      message_id: message.id,
      file_name: att.file_name,
      file_size: att.file_size,
      mime_type: att.mime_type,
      storage_path: att.storage_path,
      file_id: att.file_id,
    }))
    const { error: fwdError } = await supabase.from('message_attachments').insert(rows)
    if (fwdError) {
      logger.error('Failed to create forwarded attachments:', fwdError)
    }
  }

  const hasAnyAttachments = totalAttachments > 0

  if (params.replyToMessageId || hasAnyAttachments) {
    const { data: fullMessage } = await supabase
      .from('project_messages')
      .select(MESSAGE_SELECT)
      .eq('id', message.id)
      .single()

    if (fullMessage) {
      message = castToProjectMessage(fullMessage)
      await hydrateReplyMessages([message])
    }
  }

  if (hasAnyAttachments) {
    let tgQuery = supabase
      .from('project_telegram_chats')
      .select('telegram_chat_id')
      .eq('is_active', true)
    if (params.threadId) {
      tgQuery = tgQuery.eq('thread_id', params.threadId)
    } else {
      tgQuery = tgQuery.eq('project_id', params.projectId ?? '').eq('channel', channel)
    }
    const { data: tgLink } = await tgQuery.maybeSingle()

    if (tgLink?.telegram_chat_id) {
      // Refresh session to ensure fresh JWT for Edge Function auth
      await supabase.auth.getSession()

      supabase.functions
        .invoke('telegram-send-message', {
          body: {
            message_id: message.id,
            project_id: params.projectId,
            // В split-варианте текст уже ушёл триггером как отдельное сообщение —
            // здесь отправляем только файлы, без caption (placeholder 📎).
            content: shouldSplit ? '📎' : params.content,
            sender_name: params.senderName,
            sender_role: params.senderRole,
            telegram_chat_id: tgLink.telegram_chat_id,
            attachments_only: true,
          },
        })
        .catch((err) => {
          logger.error('Failed to send attachments to Telegram:', err)
        })
    }
  }

  // Возвращаем файловую запись (оптимистик обновится именно на неё).
  // Текстовая запись подхватится через realtime.
  void textRowId
  return message
}

/**
 * Delete message (with Storage cleanup and Telegram sync)
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { data: message, error: fetchError } = await supabase
    .from('project_messages')
    .select(
      'telegram_message_id, telegram_chat_id, attachments:message_attachments(storage_path, file_id)',
    )
    .eq('id', messageId)
    .single()

  if (fetchError) throw new ConversationError(`Ошибка загрузки сообщения: ${fetchError.message}`)

  const attachments = (message.attachments ?? []) as {
    storage_path: string
    file_id: string | null
  }[]
  for (const att of attachments) {
    if (att.file_id) {
      const { count: maCount } = await supabase
        .from('message_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('file_id', att.file_id)
        .neq('message_id', messageId)
      const { count: dfCount } = await supabase
        .from('document_files')
        .select('id', { count: 'exact', head: true })
        .eq('file_id', att.file_id)
      const totalRefs = (maCount || 0) + (dfCount || 0)

      if (totalRefs === 0) {
        const { data: fileRecord } = await supabase
          .from('files')
          .select('bucket, storage_path')
          .eq('id', att.file_id)
          .maybeSingle()
        if (fileRecord) {
          await supabase.storage.from(fileRecord.bucket).remove([fileRecord.storage_path])
        }
        await supabase.from('files').delete().eq('id', att.file_id)
      }
    } else {
      await supabase.storage.from('message-attachments').remove([att.storage_path])
    }
  }

  const { error: deleteError } = await supabase
    .from('project_messages')
    .delete()
    .eq('id', messageId)

  if (deleteError) throw new ConversationError(`Ошибка удаления сообщения: ${deleteError.message}`)

  if (message.telegram_message_id && message.telegram_chat_id) {
    await supabase.auth.getSession()

    supabase.functions
      .invoke('telegram-delete-message', {
        body: {
          telegram_chat_id: message.telegram_chat_id,
          telegram_message_id: message.telegram_message_id,
        },
      })
      .catch((err) => {
        logger.error('Failed to delete message in Telegram:', err)
      })
  }
}

/**
 * Edit message (with Telegram sync)
 */
export async function editMessage(
  messageId: string,
  newContent: string,
  senderName: string,
  senderRole: string | null,
): Promise<ProjectMessage> {
  const { error: updateError } = await supabase
    .from('project_messages')
    .update({ content: newContent, is_edited: true })
    .eq('id', messageId)

  if (updateError) throw new ConversationError(`Ошибка редактирования: ${updateError.message}`)

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('id', messageId)
    .single()

  if (error) throw new ConversationError(`Ошибка загрузки сообщения: ${error.message}`)

  const message = castToProjectMessage(data)
  await hydrateReplyMessages([message])

  if (message.telegram_message_id && message.telegram_chat_id) {
    await supabase.auth.getSession()

    supabase.functions
      .invoke('telegram-edit-message', {
        body: {
          message_id: messageId,
          content: newContent,
          sender_name: senderName,
          sender_role: senderRole,
          telegram_chat_id: message.telegram_chat_id,
          telegram_message_id: message.telegram_message_id,
        },
      })
      .catch((err) => {
        logger.error('Failed to edit message in Telegram:', err)
      })
  }

  return message
}

// Participant functions вынесены в messengerParticipantService.ts — реэкспортированы выше.
// Draft functions вынесены в messengerDraftService.ts — реэкспортированы выше.

/**
 * Повторная отправка уже существующего сообщения в Telegram-группу.
 * Используется для кнопки «Повторить отправку» при статусе failed.
 *
 * Edge Function telegram-send-message идемпотентна по message_id: повторный вызов
 * обновит telegram_message_id / telegram_attachments_delivered той же записи.
 * Чтобы не задвоить текст в TG (если он уже ушёл через триггер БД), используем
 * attachments_only при наличии вложений — тогда caption придёт только если
 * telegram_message_id пустой, а дубля не будет, потому что триггер сработал один раз.
 */
export async function retryTelegramSend(
  message: ProjectMessage,
  senderName: string,
  senderRole: string | null,
): Promise<void> {
  let tgQuery = supabase
    .from('project_telegram_chats')
    .select('telegram_chat_id')
    .eq('is_active', true)
  if (message.thread_id) {
    tgQuery = tgQuery.eq('thread_id', message.thread_id)
  } else {
    tgQuery = tgQuery
      .eq('project_id', message.project_id ?? '')
      .eq('channel', message.channel ?? 'client')
  }
  const { data: tgLink } = await tgQuery.maybeSingle()

  if (!tgLink?.telegram_chat_id) {
    throw new ConversationError('Чат не привязан к Telegram')
  }

  const hasAttachments = !!message.attachments?.length

  // Refresh session to ensure fresh JWT for Edge Function auth
  await supabase.auth.getSession()

  const { error } = await supabase.functions.invoke('telegram-send-message', {
    body: {
      message_id: message.id,
      project_id: message.project_id,
      content: message.content,
      sender_name: senderName,
      sender_role: senderRole,
      telegram_chat_id: tgLink.telegram_chat_id,
      ...(hasAttachments ? { attachments_only: true } : {}),
    },
  })

  if (error) {
    logger.error('Retry Telegram send failed:', error)
    throw new ConversationError('Не удалось отправить сообщение в Telegram')
  }
}
