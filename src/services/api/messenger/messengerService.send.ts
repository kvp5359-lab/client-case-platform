/**
 * Messenger write paths — send a new message (with optional attachments) +
 * the split heuristic that decides when to write two `project_messages`
 * (text + files separately) vs one. Вынесено из messengerService.ts.
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
import type { ForwardedAttachment, MessageChannel, ProjectMessage } from './messengerService.types'

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

/**
 * Send a message (with optional attachments).
 *
 * Split-behavior: если есть текст И 2+ вложений — пишем в БД два отдельных
 * `project_messages`: один с текстом, второй с файлами. Оба идут в тред
 * последовательно, каждый со своими реакциями. Это повторяет структуру TG,
 * где альбом и сопроводительный текст — тоже два разных сообщения.
 * Для одного файла + текста пишем одну запись, текст уходит как caption.
 */
export function shouldSplitTextAndFiles(params: {
  content: string
  attachments?: File[]
  forwardedAttachments?: ForwardedAttachment[]
}): boolean {
  const totalAttachments =
    (params.attachments?.length ?? 0) + (params.forwardedAttachments?.length ?? 0)
  const hasText =
    !!params.content &&
    params.content.trim() !== '' &&
    params.content !== '<p></p>' &&
    params.content !== '📎'
  return hasText && totalAttachments >= 2
}

export async function sendMessage(params: SendMessageParams): Promise<ProjectMessage[]> {
  const channel = params.channel ?? 'client'

  const totalAttachments =
    (params.attachments?.length ?? 0) + (params.forwardedAttachments?.length ?? 0)
  const shouldSplit = shouldSplitTextAndFiles(params)

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

  let textMessage: ProjectMessage | null = null

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
      .select('*')
      .single()
    if (textErr) throw new ConversationError(`Ошибка отправки сообщения: ${textErr.message}`)
    textMessage = castToProjectMessage({
      ...textRow,
      reply_to_message: null,
      reactions: [],
      attachments: [],
    })
    if (params.replyToMessageId) {
      await hydrateReplyMessages([textMessage])
    }
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

  if (hasAnyAttachments && params.threadId) {
    // Для Wazzup / MTProto-тредов триггер БД пропускает сообщения с
    // has_attachments=true (как и для группового TG). Поэтому здесь сами
    // инициируем отправку — соответствующая edge function подтянет файлы из
    // message_attachments и создаст signed URLs / зальёт через MTProto.
    const { data: extThread } = await supabase
      .from('project_threads')
      .select('wazzup_channel_id, mtproto_session_user_id')
      .eq('id', params.threadId)
      .maybeSingle()

    const extRow = extThread as
      | { wazzup_channel_id?: string | null; mtproto_session_user_id?: string | null }
      | null

    if (extRow?.wazzup_channel_id) {
      await supabase.auth.getSession()
      supabase.functions
        .invoke('wazzup-send', { body: { message_id: message.id, attachments_only: true } })
        .catch((err) => {
          logger.error('Failed to send attachments to Wazzup:', err)
        })
    } else if (extRow?.mtproto_session_user_id) {
      await supabase.auth.getSession()
      supabase.functions
        .invoke('telegram-mtproto-send', { body: { message_id: message.id } })
        .catch((err) => {
          logger.error('Failed to send attachments via MTProto:', err)
        })
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

  // В split-варианте возвращаем [текстовая, файловая] — useSendMessage заменит
  // оба оптимистичных баббла на реальные записи сразу (без ожидания realtime).
  return textMessage ? [textMessage, message] : [message]
}

/**
 * Delete message (with Storage cleanup and Telegram sync)
 */
