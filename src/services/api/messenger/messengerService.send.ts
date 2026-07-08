/**
 * Messenger write paths — send a new message (with optional attachments) +
 * the split heuristic that decides when to write two `project_messages`
 * (text + files separately) vs one. Вынесено из messengerService.ts.
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { logger } from '@/utils/logger'
import { uploadAttachments } from './messengerAttachmentService'
import { logSendFailure } from './logSendFailure'
import {
  MESSAGE_SELECT,
  castToProjectMessage,
  hydrateReplyMessages,
} from './messengerService.helpers'
import type { ForwardedAttachment, MessageChannel, ProjectMessage } from './messengerService.types'

export type SendMessageParams = {
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
  /** Видимость (Фаза 2): client (по умолч.) / team / self. */
  visibility?: 'client' | 'team' | 'self'
  /** Для team: false = «Заметка» (тихо). По умолчанию true. */
  notifySubscribers?: boolean
  /** participant_id упомянутых через @ — пишутся в message_mentions (автоподписка). */
  mentions?: string[]
  /** Email-аккаунт ОТПРАВИТЕЛЯ (текущего пользователя) — для email-тредов письмо
   *  уходит от него (email-internal-send: m.email_send_account_id приоритетнее треда). */
  emailSendAccountId?: string | null
  /** Тред, в который пишется сообщение. Обязателен — legacy-режим без треда удалён. */
  threadId: string
  /** Если перед отправкой пользователь нажал «Перевести» — здесь оригинал
   *  (виден только автору в UI), `content` уходит получателю как перевод. */
  originalContent?: string | null
  originalLanguage?: string | null
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
  // Для email-тредов split отключаем — отправляем одно письмо с текстом и
  // файлами вместе. В UI это рендерится как один баббл (как обычное email-сообщение).
  let isEmailThread = false
  if (params.threadId) {
    const { data: t } = await supabase
      .from('project_threads')
      .select('type')
      .eq('id', params.threadId)
      .maybeSingle()
    isEmailThread = (t as { type?: string } | null)?.type === 'email'
  }
  const shouldSplit = !isEmailThread && shouldSplitTextAndFiles(params)

  const commonFields = {
    ...(params.projectId ? { project_id: params.projectId } : {}),
    workspace_id: params.workspaceId,
    sender_participant_id: params.senderParticipantId,
    sender_name: params.senderName,
    sender_role: params.senderRole,
    source: 'web' as const,
    channel,
    visibility: params.visibility ?? 'client',
    notify_subscribers: params.notifySubscribers ?? true,
    // В email-треде — аккаунт отправителя (письмо уходит от пишущего).
    ...(isEmailThread && params.emailSendAccountId
      ? { email_send_account_id: params.emailSendAccountId }
      : {}),
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
        original_content: params.originalContent ?? null,
        original_language: params.originalLanguage ?? null,
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
      // Если в split-режиме — оригинал прикрепляем к текстовой записи (см. выше).
      ...(shouldSplit
        ? {}
        : {
            original_content: params.originalContent ?? null,
            original_language: params.originalLanguage ?? null,
          }),
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

  // @-упоминания — пишем в message_mentions (триггер подпишет упомянутых на тред).
  // Цепляем к записи с текстом (в split-режиме — textMessage).
  if (params.mentions && params.mentions.length > 0) {
    const mentionTargetId = textMessage?.id ?? message.id
    const { error: mErr } = await supabase
      .from('message_mentions')
      .insert(params.mentions.map((pid) => ({ message_id: mentionTargetId, participant_id: pid })))
    if (mErr) logger.error('Failed to insert message_mentions:', mErr)
  }

  const hasAnyAttachments = totalAttachments > 0

  // 🔒 Внешнюю доставку вложений запускаем ТОЛЬКО для клиентских сообщений.
  // Внутренние (team/self/«Заметка») наружу не уходят — их текст блокирует
  // триггер БД (dispatch_message_to_channels), но вложения идут ФРОНТ-invoke'ом
  // мимо триггера. Без этого гейта внутреннее сообщение с файлом утекало клиенту
  // в канал (баг 2026-07-08). Вложение при этом всё равно загружено в сервис.
  const isClientVisible = (params.visibility ?? 'client') === 'client'

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

  if (hasAnyAttachments && params.threadId && isClientVisible) {
    // Для Email / Wazzup / MTProto-тредов триггер БД пропускает сообщения с
    // has_attachments=true (как и для группового TG). Поэтому здесь сами
    // инициируем отправку — соответствующая edge function подтянет файлы из
    // message_attachments и создаст signed URLs / зальёт через MTProto.
    //
    // Email добавлен в этот блок, потому что иначе была race: триггер
    // запускал email-internal-send до того, как фронт успевал загрузить
    // файлы → письмо уходило с неполным набором вложений (или с одним).
    const { data: extThread } = await supabase
      .from('project_threads')
      .select('type, wazzup_channel_id, mtproto_session_user_id, email_send_account_id')
      .eq('id', params.threadId)
      .maybeSingle()

    const extRow = extThread as
      | {
          type?: string | null
          wazzup_channel_id?: string | null
          mtproto_session_user_id?: string | null
          email_send_account_id?: string | null
        }
      | null

    // Email-тред определяется так же, как в SQL-триггере: либо тред типа
    // 'email', либо есть привязка к gmail-аккаунту (email_send_account_id).
    // Дополнительная проверка по входящим email_internal-сообщениям здесь
    // не нужна — на момент исходящего ответа тред уже либо type='email',
    // либо имеет email_send_account_id (по факту это уже email-тред).
    const isEmailThread = extRow?.type === 'email' || !!extRow?.email_send_account_id

    if (isEmailThread) {
      // Refresh session — но не блокируем invoke если что-то пошло не так
      // (вид сессии гонит свою цепочку обновления, иначе пользовательские
      // jpg-апроверы могли подвиснуть).
      void supabase.auth.getSession().catch(() => {})
      try {
        const { error } = await supabase.functions.invoke('email-internal-send', {
          body: { message_id: message.id },
        })
        if (error) throw error
      } catch (err) {
        logger.error('Failed to send email with attachments:', err)
        // Серверный лог — sticky-toast прилетит пользователю даже если он
        // закрыл вкладку. Раньше catch проглатывал ошибку и пользователь
        // не понимал почему сообщение «зависло» на «Отправляется».
        void logSendFailure({
          workspace_id: params.workspaceId,
          project_id: params.projectId ?? null,
          thread_id: params.threadId,
          participant_id: params.senderParticipantId,
          content: params.content ?? null,
          attachment_names: (params.attachments ?? []).map((f) => f.name),
          error_text: err instanceof Error ? err.message : String(err),
          error_code: 'email_send_invoke_failed',
          source: 'email',
          metadata: { stage: 'email_internal_send_invoke' },
        })
      }
    } else if (extRow?.wazzup_channel_id) {
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

  if (hasAnyAttachments && isClientVisible) {
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
