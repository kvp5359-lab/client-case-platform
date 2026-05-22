/**
 * Messenger edit/delete/retry paths — operations on existing messages.
 * Вынесено из messengerService.ts.
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import {
  MESSAGE_SELECT,
  castToProjectMessage,
  hydrateReplyMessages,
} from './messengerService.helpers'
import type { ProjectMessage } from './messengerService.types'

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
// Повторная отправка (retry) — теперь это просто UPDATE send_status='pending' в
// useRetryTelegramSend.ts, БД-триггер notify_on_send_status_retry дёргает диспетчер.
// Старая функция retryTelegramSend (с прямым invoke telegram-send-message) удалена.
