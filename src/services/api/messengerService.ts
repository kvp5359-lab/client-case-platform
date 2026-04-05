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
  MessageAttachment,
  ForwardedAttachment,
  EmailMetadata,
} from './messengerService.types'

export interface SendMessageParams {
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
  channel?: MessageChannel
  threadId?: string
}

// Internal helpers (MESSAGE_SELECT, castToProjectMessage, castToProjectMessages,
// hydrateReplyMessages) вынесены в messengerService.helpers.ts — импортируются выше.

// =====================================================
// Message CRUD
// =====================================================

/**
 * Load a page of messages (cursor pagination, newest first)
 */
export async function getMessages(
  projectId: string | undefined,
  options: { before?: string; limit?: number; channel?: MessageChannel; threadId?: string } = {},
): Promise<{ messages: ProjectMessage[]; hasMore: boolean }> {
  const limit = options.limit ?? 50

  let query = supabase.from('project_messages').select(MESSAGE_SELECT)

  // threadId takes priority over project_id+channel
  if (options.threadId) {
    query = query.eq('thread_id', options.threadId)
  } else if (projectId) {
    query = query.eq('project_id', projectId).eq('channel', options.channel ?? 'client')
  } else {
    // No project and no thread — return empty
    return { messages: [], hasMore: false }
  }

  query = query.order('created_at', { ascending: false }).limit(limit + 1)

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
 * Send a message (with optional attachments)
 */
export async function sendMessage(params: SendMessageParams): Promise<ProjectMessage> {
  const channel = params.channel ?? 'client'
  const { data, error } = await supabase
    .from('project_messages')
    .insert({
      ...(params.projectId ? { project_id: params.projectId } : {}),
      workspace_id: params.workspaceId,
      content: params.content,
      sender_participant_id: params.senderParticipantId,
      sender_name: params.senderName,
      sender_role: params.senderRole,
      source: 'web' as const,
      reply_to_message_id: params.replyToMessageId ?? null,
      channel,
      ...(params.threadId ? { thread_id: params.threadId } : {}),
      has_attachments:
        (params.attachments && params.attachments.length > 0) ||
        (params.forwardedAttachments && params.forwardedAttachments.length > 0) ||
        false,
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

  const hasAnyAttachments =
    (params.attachments && params.attachments.length > 0) ||
    (params.forwardedAttachments && params.forwardedAttachments.length > 0)

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
      supabase.functions
        .invoke('telegram-send-message', {
          body: {
            message_id: message.id,
            project_id: params.projectId,
            // Don't pass content — trigger already sent the text.
            // Edge Function will send files only.
            content: '📎',
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
