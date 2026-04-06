"use client"

/**
 * Хук для отправки сообщения в чат проекта
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  sendMessage,
  markAsRead,
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  type ProjectMessage,
  type ReplyMessage,
  type MessageChannel,
  type ForwardedAttachment,
} from '@/services/api/messengerService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'
import { dismissProjectToasts } from './useMessageToastPayload'

export function useSendMessage(
  projectId: string | undefined,
  workspaceId: string,
  currentParticipant?: { participantId: string; name: string; role: string | null },
  channel: MessageChannel = 'client',
  threadId?: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const messagesKey = threadId
    ? messengerKeys.messagesByThreadId(threadId)
    : messengerKeys.messages(projectId ?? '', channel)

  return useMutation({
    mutationFn: async ({
      content,
      replyToMessageId,
      attachments,
      forwardedAttachments,
    }: {
      content: string
      replyToMessageId?: string | null
      replyToMessage?: ProjectMessage | null
      attachments?: File[]
      forwardedAttachments?: ForwardedAttachment[]
    }) => {
      if (!user) throw new Error('Не авторизован')

      const participant =
        currentParticipant ??
        (projectId
          ? await getCurrentProjectParticipant(projectId, user.id)
          : await getCurrentWorkspaceParticipant(workspaceId, user.id))
      if (!participant) throw new Error('Нет доступа')

      return sendMessage({
        projectId,
        workspaceId,
        content,
        senderParticipantId: participant.participantId,
        senderName: participant.name,
        senderRole: participant.role,
        replyToMessageId,
        attachments,
        forwardedAttachments,
        channel,
        threadId,
      })
    },
    // Оптимистичное обновление
    onMutate: async ({ content, replyToMessageId, replyToMessage, attachments }) => {
      const qk = messagesKey
      await queryClient.cancelQueries({ queryKey: qk })
      const previous = queryClient.getQueryData(qk)

      let replyData: ReplyMessage | null = null
      if (replyToMessage && replyToMessageId) {
        replyData = {
          id: replyToMessage.id,
          content: replyToMessage.content,
          sender_name: replyToMessage.sender_name,
        }
      }

      const now = new Date().toISOString()
      const optimisticId = `optimistic-${crypto.randomUUID()}`
      const optimisticAttachments = (attachments ?? []).map((file, i) => ({
        id: `optimistic-att-${optimisticId}-${i}`,
        message_id: optimisticId,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        storage_path: '',
        telegram_file_id: null,
        transcription: null,
        file_id: null,
        created_at: now,
      }))

      const optimistic: ProjectMessage = {
        id: optimisticId,
        project_id: projectId ?? null,
        workspace_id: workspaceId,
        sender_participant_id: currentParticipant?.participantId ?? null,
        sender_name: currentParticipant?.name ?? 'Вы',
        sender_role: currentParticipant?.role ?? null,
        content,
        source: 'web',
        reply_to_message_id: replyToMessageId ?? null,
        reply_to_message: replyData,
        telegram_message_id: null,
        telegram_chat_id: null,
        is_edited: false,
        is_draft: false,
        forwarded_from_name: null,
        forwarded_date: null,
        scheduled_send_at: null,
        channel,
        thread_id: threadId ?? null,
        email_metadata: null,
        created_at: now,
        updated_at: now,
        reactions: [],
        attachments: optimisticAttachments,
        sender: null,
      }

      queryClient.setQueryData(qk, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = [...typed.pages]
        const last = pages[pages.length - 1]
        pages[pages.length - 1] = {
          ...last,
          messages: [...last.messages, optimistic],
        }
        return { ...typed, pages }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesKey, context.previous)
      }
      toast.error('Не удалось отправить сообщение')
    },
    onSuccess: (result, variables) => {
      const qk = messagesKey
      queryClient.setQueryData(qk, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) => (msg.id.startsWith('optimistic-') ? result : msg)),
        }))
        return { ...typed, pages }
      })
      // Если есть вложения — не рефетчим: вложения могут ещё не успеть записаться в БД,
      // рефетч вернёт сообщение без файлов. Realtime обновит данные когда всё готово.
      const hasFiles =
        (variables.attachments?.length ?? 0) > 0 ||
        (variables.forwardedAttachments?.length ?? 0) > 0
      if (!hasFiles) {
        queryClient.refetchQueries({ queryKey: qk })
      }

      // Dismiss toast notifications for this project
      if (projectId) dismissProjectToasts(projectId)

      // Отправка сообщения = прочитал чат
      if (currentParticipant) {
        markAsRead(currentParticipant.participantId, projectId, channel, threadId)
          .then(() => {
            const unreadKey = threadId
              ? messengerKeys.unreadCountByThreadId(threadId)
              : messengerKeys.unreadCount(projectId ?? '', channel)
            const lastReadKey = threadId
              ? messengerKeys.lastReadAtByThreadId(threadId)
              : messengerKeys.lastReadAt(projectId ?? '', channel)
            queryClient.setQueryData(unreadKey, 0)
            queryClient.invalidateQueries({
              queryKey: lastReadKey,
            })
            queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
          })
          .catch(() => {
            // Не критично — сообщение отправлено, просто markAsRead не удался
          })
      }
    },
  })
}
