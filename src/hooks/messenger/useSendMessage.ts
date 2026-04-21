"use client"

/**
 * Хук для отправки сообщения в чат проекта.
 *
 * После audit S1 cleanup-а threadId стал обязательным, legacy-режим
 * (projectId+channel без thread_id) удалён.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  sendMessage,
  shouldSplitTextAndFiles,
  markAsRead,
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  type ProjectMessage,
  type ReplyMessage,
  type MessageChannel,
  type ForwardedAttachment,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import { dismissProjectToasts } from './useMessageToastPayload'

export function useSendMessage(
  projectId: string | undefined,
  workspaceId: string,
  currentParticipant: { participantId: string; name: string; role: string | null } | undefined,
  channel: MessageChannel,
  threadId: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

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
    onMutate: async ({ content, replyToMessageId, replyToMessage, attachments, forwardedAttachments }) => {
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
      const willSplit = shouldSplitTextAndFiles({ content, attachments, forwardedAttachments })

      const makeOptimistic = (
        suffix: 'text' | 'files' | 'single',
        overrides: Partial<ProjectMessage>,
      ): ProjectMessage => {
        const id = `optimistic-${suffix}-${crypto.randomUUID()}`
        return {
          id,
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
          telegram_attachments_delivered: null,
          is_edited: false,
          is_draft: false,
          forwarded_from_name: null,
          forwarded_date: null,
          scheduled_send_at: null,
          channel,
          thread_id: threadId,
          email_metadata: null,
          created_at: now,
          updated_at: now,
          reactions: [],
          attachments: [],
          sender: null,
          ...overrides,
        }
      }

      const optimisticFilesAttachments = (attachments ?? []).map((file, i) => ({
        id: `optimistic-att-${crypto.randomUUID()}-${i}`,
        message_id: '',
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        storage_path: '',
        telegram_file_id: null,
        transcription: null,
        file_id: null,
        created_at: now,
      }))

      const optimisticList: ProjectMessage[] = willSplit
        ? [
            makeOptimistic('text', { content, attachments: [] }),
            makeOptimistic('files', {
              content: '📎',
              reply_to_message_id: null,
              reply_to_message: null,
              attachments: optimisticFilesAttachments,
            }),
          ]
        : [
            makeOptimistic('single', {
              content,
              attachments: optimisticFilesAttachments,
            }),
          ]

      queryClient.setQueryData(qk, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = [...typed.pages]
        const last = pages[pages.length - 1]
        pages[pages.length - 1] = {
          ...last,
          messages: [...last.messages, ...optimisticList],
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
        // Убираем оптимистики и дедуплицируем с realtime-версиями (если succeed
        // успел отработать после того, как realtime уже добавил запись).
        const realIds = new Set(result.map((m) => m.id))
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.filter(
            (msg) => !msg.id.startsWith('optimistic-') && !realIds.has(msg.id),
          ),
        }))
        const lastIdx = pages.length - 1
        pages[lastIdx] = {
          ...pages[lastIdx],
          messages: [...pages[lastIdx].messages, ...result],
        }
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
            queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), 0)
            queryClient.invalidateQueries({
              queryKey: messengerKeys.lastReadAtByThreadId(threadId),
            })
            invalidateMessengerCaches(queryClient, workspaceId)
          })
          .catch(() => {
            // Не критично — сообщение отправлено, просто markAsRead не удался
          })
      }
    },
  })
}
