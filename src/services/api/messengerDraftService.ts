/**
 * Draft messages service.
 * Extracted from messengerService.ts to reduce file size.
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import { uploadAttachments } from './messengerAttachmentService'
import {
  MESSAGE_SELECT,
  castToProjectMessage,
  hydrateReplyMessages,
} from './messengerService.helpers'
import type { ProjectMessage, MessageChannel } from './messengerService.types'

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
              .maybeSingle()
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
