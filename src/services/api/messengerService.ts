/**
 * Messenger service — core types, message CRUD, and re-exports from sub-services
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import { uploadAttachments } from './messengerAttachmentService'

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

// =====================================================
// Internal helpers
// =====================================================

const MESSAGE_SELECT = `
  *,
  sender:participants!sender_participant_id(avatar_url),
  reactions:message_reactions(*, participant:participants!participant_id(name, last_name, avatar_url)),
  attachments:message_attachments(*)
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join response is untyped
function castToProjectMessage(row: any): ProjectMessage {
  return row as ProjectMessage
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join response is untyped
function castToProjectMessages(rows: any[]): ProjectMessage[] {
  return rows as ProjectMessage[]
}

/** Hydrate reply_to_message for messages with reply_to_message_id */
async function hydrateReplyMessages(messages: ProjectMessage[]): Promise<void> {
  const replyIds = [
    ...new Set(messages.map((m) => m.reply_to_message_id).filter(Boolean) as string[]),
  ]
  if (replyIds.length === 0) return

  const { data } = await supabase
    .from('project_messages')
    .select('id, content, sender_name')
    .in('id', replyIds)

  if (!data) return
  const map = new Map(data.map((r) => [r.id, r as ReplyMessage]))
  for (const msg of messages) {
    msg.reply_to_message = msg.reply_to_message_id
      ? (map.get(msg.reply_to_message_id) ?? null)
      : null
  }
}

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
    await uploadAttachments(params.attachments, message.id, params.workspaceId, params.projectId)
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
      tgQuery = tgQuery.eq('project_id', params.projectId).eq('channel', channel)
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

/**
 * Get current user's participant_id in project
 */
export async function getCurrentProjectParticipant(
  projectId: string,
  userId: string,
): Promise<{
  participantId: string
  name: string
  role: string | null
} | null> {
  const { data } = await supabase
    .from('project_participants')
    .select(
      `
      participant_id,
      project_roles,
      participants!inner(id, name, last_name, user_id)
    `,
    )
    .eq('project_id', projectId)
    .eq('participants.user_id', userId)
    .maybeSingle()

  if (!data) return null

  const p = data.participants as { id: string; name: string; last_name: string | null }
  const roles = data.project_roles as string[] | null
  const roleName = roles?.[0] ?? null

  return {
    participantId: p.id,
    name: [p.name, p.last_name].filter(Boolean).join(' '),
    role: roleName,
  }
}

/**
 * Get current user's participant_id in workspace (for tasks without project)
 */
export async function getCurrentWorkspaceParticipant(
  workspaceId: string,
  userId: string,
): Promise<{
  participantId: string
  name: string
  role: string | null
} | null> {
  const { data } = await supabase
    .from('participants')
    .select('id, name, last_name, workspace_roles')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!data) return null

  const roles = data.workspace_roles as string[] | null
  const roleName = roles?.[0] ?? null

  return {
    participantId: data.id,
    name: [data.name, data.last_name].filter(Boolean).join(' '),
    role: roleName,
  }
}

// =====================================================
// Draft messages
// =====================================================

export interface SaveDraftParams {
  projectId?: string
  workspaceId: string
  content: string
  senderParticipantId: string
  senderName: string
  senderRole: string | null
  attachments?: File[]
  channel?: MessageChannel
  threadId?: string
}

/**
 * Save a new draft message (INSERT with is_draft=true, no Telegram send)
 */
export async function saveDraftMessage(params: SaveDraftParams): Promise<ProjectMessage> {
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
      channel,
      ...(params.threadId ? { thread_id: params.threadId } : {}),
      is_draft: true,
      has_attachments: (params.attachments && params.attachments.length > 0) || false,
    })
    .select('*')
    .single()

  if (error) throw new ConversationError(`Ошибка сохранения черновика: ${error.message}`)

  let message = castToProjectMessage({
    ...data,
    reply_to_message: null,
    reactions: [],
    attachments: [],
  })

  if (params.attachments && params.attachments.length > 0) {
    await uploadAttachments(params.attachments, message.id, params.workspaceId, params.projectId)
    const { data: fullMessage } = await supabase
      .from('project_messages')
      .select(MESSAGE_SELECT)
      .eq('id', message.id)
      .single()
    if (fullMessage) {
      message = castToProjectMessage(fullMessage)
    }
  }

  return message
}

/**
 * Update an existing draft message content and/or attachments.
 * keepAttachmentIds — IDs of existing attachments to keep (rest are deleted).
 * newFiles — new File objects to upload.
 */
export async function updateDraftMessage(
  messageId: string,
  newContent: string,
  workspaceId: string,
  projectId: string,
  keepAttachmentIds?: string[],
  newFiles?: File[],
): Promise<ProjectMessage> {
  const { error: updateError } = await supabase
    .from('project_messages')
    .update({ content: newContent })
    .eq('id', messageId)

  if (updateError)
    throw new ConversationError(`Ошибка обновления черновика: ${updateError.message}`)

  // Manage attachments: delete removed, keep existing, add new
  if (keepAttachmentIds !== undefined) {
    const { data: oldAtts } = await supabase
      .from('message_attachments')
      .select('id, storage_path, file_id')
      .eq('message_id', messageId)

    if (oldAtts) {
      const keepSet = new Set(keepAttachmentIds)
      const toDelete = oldAtts.filter((a) => !keepSet.has(a.id))

      for (const att of toDelete) {
        if (att.file_id) {
          // Check if file is referenced elsewhere before deleting
          const { count: maCount } = await supabase
            .from('message_attachments')
            .select('id', { count: 'exact', head: true })
            .eq('file_id', att.file_id)
            .neq('id', att.id)
          const { count: dfCount } = await supabase
            .from('document_files')
            .select('id', { count: 'exact', head: true })
            .eq('file_id', att.file_id)

          if ((maCount || 0) + (dfCount || 0) === 0) {
            const { data: fileRecord } = await supabase
              .from('files')
              .select('bucket, storage_path')
              .eq('id', att.file_id)
              .single()
            if (fileRecord) {
              await supabase.storage.from(fileRecord.bucket).remove([fileRecord.storage_path])
            }
            await supabase.from('files').delete().eq('id', att.file_id)
          }
        }
        await supabase.from('message_attachments').delete().eq('id', att.id)
      }
    }
  }

  // Upload new files
  if (newFiles && newFiles.length > 0) {
    await uploadAttachments(newFiles, messageId, workspaceId, projectId)
  }

  // Update has_attachments flag
  const { count: attCount } = await supabase
    .from('message_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', messageId)
  await supabase
    .from('project_messages')
    .update({ has_attachments: (attCount || 0) > 0 })
    .eq('id', messageId)

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('id', messageId)
    .single()

  if (error) throw new ConversationError(`Ошибка загрузки черновика: ${error.message}`)

  const message = castToProjectMessage(data)
  await hydrateReplyMessages([message])
  return message
}

/**
 * Publish a draft — set is_draft=false and send to Telegram
 */
export async function publishDraftMessage(
  messageId: string,
  senderName: string,
  senderRole: string | null,
): Promise<ProjectMessage> {
  const { error: updateError } = await supabase
    .from('project_messages')
    .update({ is_draft: false })
    .eq('id', messageId)

  if (updateError)
    throw new ConversationError(`Ошибка публикации черновика: ${updateError.message}`)

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('id', messageId)
    .single()

  if (error) throw new ConversationError(`Ошибка загрузки сообщения: ${error.message}`)

  const message = castToProjectMessage(data)
  await hydrateReplyMessages([message])

  // Send to Telegram (same logic as sendMessage)
  let tgQuery = supabase
    .from('project_telegram_chats')
    .select('telegram_chat_id')
    .eq('is_active', true)
  if (message.thread_id) {
    tgQuery = tgQuery.eq('thread_id', message.thread_id)
  } else {
    tgQuery = tgQuery
      .eq('project_id', message.project_id)
      .eq('channel', message.channel ?? 'client')
  }
  const { data: tgLink } = await tgQuery.maybeSingle()

  if (tgLink?.telegram_chat_id) {
    const hasAttachments = message.attachments && message.attachments.length > 0

    // Single call: with attachments_only if has files, otherwise plain text
    supabase.functions
      .invoke('telegram-send-message', {
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
      .catch((err) => {
        logger.error('Failed to send published draft to Telegram:', err)
      })
  }

  return message
}
