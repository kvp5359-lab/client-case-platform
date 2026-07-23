/**
 * Draft messages service.
 * Extracted from messengerService.ts to reduce file size.
 */

import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import { uploadAttachments, deleteAttachmentFileIfOrphaned } from './messengerAttachmentService'
import { deliverEmailAttachments, isEmailChannelThread } from './deliverEmailAttachments'
import { isClientVisibleForDelivery } from '@/lib/messenger/visibility'
import {
  MESSAGE_SELECT,
  castToProjectMessage,
} from './messengerService.helpers'
import type { ProjectMessage, MessageChannel, MessageVisibility } from './messengerService.types'

export type SaveDraftParams = {
  projectId?: string
  workspaceId: string
  content: string
  senderParticipantId: string
  senderName: string
  senderRole: string | null
  attachments?: File[]
  channel?: MessageChannel
  threadId?: string
  /**
   * Видимость сообщения (client/team/self). ОБЯЗАТЕЛЬНО сохранять в черновик:
   * иначе колонка получит DEFAULT 'client', и при публикации (немедленной или
   * по расписанию/cron) внутренний черновик «Команде/Заметка/Только я» утечёт
   * клиенту в канал — гейт видимости в dispatch_message_to_channels и
   * publishDraftMessage смотрит именно на это поле. См. Фаза 2.1 аудита.
   */
  visibility?: MessageVisibility
  notifySubscribers?: boolean
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
      visibility: params.visibility ?? 'client',
      notify_subscribers: params.notifySubscribers ?? true,
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
    await uploadAttachments(params.attachments, message.id, params.workspaceId, params.projectId ?? '')
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
        await deleteAttachmentFileIfOrphaned(att)
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
  return message
}

/**
 * Опубликовать черновик/отложенное — снять is_draft и доставить во ВСЕ каналы.
 *
 * D3.1 (гибрид): доставку текста и НЕ-email вложений делает единый серверный
 * диспетчер `deliver_message` → `dispatch_message_to_channels` (тот же канон,
 * что триггер/cron: маршрутизация + гейт visibility). Раньше фронт слал сам и
 * ТОЛЬКО в TG-группу (email/wazzup/mtproto-черновики не уходили). Email-вложения
 * диспетчер архитектурно пропускает (гонка загрузки файлов) → их дошлём фронтом.
 *
 * `senderName`/`senderRole` больше не нужны для доставки (диспетчер берёт из
 * сообщения), но параметры сохранены — их передают существующие вызывающие.
 * is_draft снимается здесь idempotent'но: для delayed-CAS он уже снят
 * захватом, для кнопки — снимается тут.
 */
export async function publishDraftMessage(
  messageId: string,
  _senderName?: string,
  _senderRole?: string | null,
): Promise<ProjectMessage> {
  const { error: updateError } = await supabase
    .from('project_messages')
    .update({ is_draft: false })
    .eq('id', messageId)
  if (updateError)
    throw new ConversationError(`Ошибка публикации черновика: ${updateError.message}`)

  // Канонический серверный диспетчер: текст + не-email вложения во все каналы,
  // с гейтом visibility (внутреннее клиенту не уйдёт). Единый путь с триггером/cron.
  const { error: deliverError } = await supabase.rpc('deliver_message', {
    p_message_id: messageId,
  })
  if (deliverError)
    throw new ConversationError(`Ошибка доставки сообщения: ${deliverError.message}`)

  const { data, error } = await supabase
    .from('project_messages')
    .select(MESSAGE_SELECT)
    .eq('id', messageId)
    .single()
  if (error) throw new ConversationError(`Ошибка загрузки сообщения: ${error.message}`)

  const message = castToProjectMessage(data)

  // Email-вложения диспетчер НЕ шлёт (архитектурно только фронт, из-за гонки
  // загрузки) → дошлём здесь. Гейт isClientVisible обязателен: этот путь минует
  // серверный гейт диспетчера (утечка 2026-07-08). Прочие каналы уже доставлены
  // deliver_message выше.
  const hasAttachments = !!message.attachments && message.attachments.length > 0
  const isClientVisible = isClientVisibleForDelivery(message.visibility as string | undefined)
  if (hasAttachments && isClientVisible && message.thread_id) {
    if (await isEmailChannelThread(message.thread_id)) {
      await deliverEmailAttachments({
        messageId,
        workspaceId: message.workspace_id,
        projectId: message.project_id ?? null,
        threadId: message.thread_id,
        senderParticipantId: message.sender_participant_id ?? null,
        content: message.content ?? null,
        attachmentNames: (message.attachments ?? []).map((a) => a.file_name),
      })
    }
  }

  return message
}
