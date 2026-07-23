/**
 * Messenger edit/delete/retry paths — operations on existing messages.
 * Вынесено из messengerService.ts.
 */

import { supabase } from '@/lib/supabase'
import { STORAGE_BUCKETS, removeFromStorage } from '@/lib/storage'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import { humanizeSendError } from '@/lib/messenger/sendErrorMessages'
import {
  MESSAGE_SELECT,
  castToProjectMessage,
  hydrateReplyMessages,
} from './messengerService.helpers'
import { resolveMessageChannelKind } from './messengerAttachmentService'
import type { ProjectMessage } from './messengerService.types'

type DeleteMessageChannelCtx = {
  thread_id: string | null
  telegram_message_id: number | null
  telegram_message_ids: number[] | null
  telegram_chat_id: number | null
  wazzup_message_id: string | null
}

/**
 * Удалить ВСЁ сообщение во внешнем канале (все id альбома). Маршрут — по полям
 * треда (у исходящих `source='web'`, канал определяется тредом). Вызывается ДО
 * удаления строки: edge-функции mtproto/wazzup резолвят внешние id по message_id.
 * Ошибки не пробрасываем — удаление у нас не должно падать из-за канала.
 */
async function deleteWholeMessageInChannel(
  messageId: string,
  msg: DeleteMessageChannelCtx,
): Promise<void> {
  try {
    let thread: { mtproto_session_user_id: string | null; business_connection_id: string | null } | null =
      null
    if (msg.thread_id) {
      const { data } = await supabase
        .from('project_threads')
        .select('mtproto_session_user_id, business_connection_id')
        .eq('id', msg.thread_id)
        .maybeSingle()
      thread = data
    }
    const kind = resolveMessageChannelKind(msg, thread)
    if (kind === 'wazzup') {
      await supabase.functions.invoke('wazzup-delete', { body: { message_id: messageId } })
    } else if (kind === 'mtproto') {
      await supabase.functions.invoke('telegram-mtproto-delete', { body: { message_id: messageId } })
    } else if (kind === 'telegram_group') {
      const ids =
        msg.telegram_message_ids && msg.telegram_message_ids.length > 0
          ? msg.telegram_message_ids
          : msg.telegram_message_id != null
            ? [msg.telegram_message_id]
            : []
      if (ids.length > 0 && msg.telegram_chat_id != null) {
        await supabase.functions.invoke('telegram-delete-message', {
          body: { telegram_chat_id: msg.telegram_chat_id, telegram_message_ids: ids },
        })
      }
    } else if (kind === 'business') {
      // Business шлёт сообщение одним message_id; edge берёт его сам по message_id.
      await supabase.functions.invoke('telegram-business-delete', {
        body: { message_id: messageId },
      })
    }
  } catch (err) {
    logger.error('Failed to delete message in channel:', err)
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { data: message, error: fetchError } = await supabase
    .from('project_messages')
    .select(
      'thread_id, telegram_message_id, telegram_message_ids, telegram_chat_id, wazzup_message_id, attachments:message_attachments(storage_path, file_id)',
    )
    .eq('id', messageId)
    .single()

  if (fetchError) throw new ConversationError(`Ошибка загрузки сообщения: ${fetchError.message}`)

  // Сначала удаляем во внешнем канале (пока строка ещё есть в БД), потом чистим у себя.
  await deleteWholeMessageInChannel(messageId, message as DeleteMessageChannelCtx)

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
          await removeFromStorage(fileRecord.bucket, [fileRecord.storage_path])
        }
        await supabase.from('files').delete().eq('id', att.file_id)
      }
    } else {
      await removeFromStorage(STORAGE_BUCKETS.messageAttachments, [att.storage_path])
    }
  }

  const { error: deleteError } = await supabase
    .from('project_messages')
    .delete()
    .eq('id', messageId)

  if (deleteError) throw new ConversationError(`Ошибка удаления сообщения: ${deleteError.message}`)
}

/**
 * Edit message (with Telegram sync)
 */
/**
 * Результат правки: сообщение + предупреждение канала, если правка сохранена
 * в сервисе, но НЕ дошла во внешний канал (раньше такой сбой глотался молча —
 * текст в ЛК менялся, в Telegram нет, и никто не знал; инцидент 2026-07-23).
 */
export type EditMessageResult = {
  message: ProjectMessage
  /** Человекочитаемая причина, почему канал не принял правку. null — дошло. */
  channelWarning: string | null
}

export async function editMessage(
  messageId: string,
  newContent: string,
  senderName: string,
  senderRole: string | null,
): Promise<EditMessageResult> {
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

  let channelWarning: string | null = null

  // Маршрут правки в канал по типу треда. Раньше ЛЮБОЙ тред с telegram_*
  // полями шёл в telegram-edit-message (бот-канал) — для MTProto-треда это НЕ
  // работало (бот не может править сообщение личного аккаунта), правка не
  // долетала до Telegram. Теперь MTProto-тред идёт в telegram-mtproto-edit.
  if (message.thread_id) {
    const { data: t } = await supabase
      .from('project_threads')
      .select('mtproto_session_user_id, mtproto_client_tg_user_id')
      .eq('id', message.thread_id)
      .maybeSingle()
    const isMtproto = !!t?.mtproto_session_user_id && !!t?.mtproto_client_tg_user_id

    if (isMtproto) {
      await supabase.auth.getSession()
      supabase.functions
        .invoke('telegram-mtproto-edit', { body: { message_id: messageId, content: newContent } })
        .catch((err) => {
          logger.error('Failed to edit message via MTProto:', err)
        })
    } else if (message.telegram_message_id && message.telegram_chat_id) {
      await supabase.auth.getSession()
      // Ждём результат: функция отвечает 200 и на отказ Telegram (ok:false +
      // description) — сбой правки в канале не должен глотаться молча.
      try {
        const { data, error } = await supabase.functions.invoke('telegram-edit-message', {
          body: {
            message_id: messageId,
            content: newContent,
            sender_name: senderName,
            sender_role: senderRole,
            telegram_chat_id: message.telegram_chat_id,
            telegram_message_id: message.telegram_message_id,
          },
        })
        if (error) throw error
        const payload = data as { ok?: boolean; error?: string } | null
        if (payload && payload.ok === false) {
          logger.error('Telegram rejected message edit:', payload.error)
          channelWarning =
            humanizeSendError(payload.error ?? null) ??
            'Правка сохранена в сервисе, но не применилась в Telegram.'
        }
      } catch (err) {
        logger.error('Failed to edit message in Telegram:', err)
        channelWarning = 'Правка сохранена в сервисе, но не применилась в Telegram.'
      }
    }
  }

  return { message, channelWarning }
}

// Participant functions вынесены в messengerParticipantService.ts — реэкспортированы выше.
// Draft functions вынесены в messengerDraftService.ts — реэкспортированы выше.
// Повторная отправка (retry) — теперь это просто UPDATE send_status='pending' в
// useRetryTelegramSend.ts, БД-триггер notify_on_send_status_retry дёргает диспетчер.
// Старая функция retryTelegramSend (с прямым invoke telegram-send-message) удалена.
