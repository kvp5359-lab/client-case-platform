"use client"

/**
 * Хуки для работы с серверными черновиками сообщений.
 * После audit S1 cleanup: threadId обязательный, legacy-режим удалён.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  saveDraftMessage,
  updateDraftMessage,
  publishDraftMessage,
  markAsRead,
  type ProjectMessage,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'

export function useSaveDraft(
  projectId: string | undefined,
  workspaceId: string,
  channel: MessageChannel,
  threadId: string,
) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: (params: {
      content: string
      senderParticipantId: string
      senderName: string
      senderRole: string | null
      attachments?: File[]
    }) =>
      saveDraftMessage({
        projectId,
        workspaceId,
        content: params.content,
        senderParticipantId: params.senderParticipantId,
        senderName: params.senderName,
        senderRole: params.senderRole,
        attachments: params.attachments,
        channel,
        threadId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey })
      toast.success('Черновик сохранён')
    },
    onError: () => {
      toast.error('Не удалось сохранить черновик')
    },
  })
}

export function useUpdateDraft(
  projectId: string | undefined,
  workspaceId: string,
  _channel: MessageChannel,
  threadId: string,
) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: (params: {
      messageId: string
      content: string
      keepAttachmentIds?: string[]
      newFiles?: File[]
    }) =>
      updateDraftMessage(
        params.messageId,
        params.content,
        workspaceId,
        projectId ?? '',
        params.keepAttachmentIds,
        params.newFiles,
      ),
    onMutate: async ({ messageId, content }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData(messagesKey)

      queryClient.setQueryData(messagesKey, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg)),
        }))
        return { ...typed, pages }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesKey, context.previous)
      }
      toast.error('Не удалось обновить черновик')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey })
      toast.success('Черновик обновлён')
    },
  })
}

export function usePublishDraft(
  projectId: string | undefined,
  workspaceId: string,
  channel: MessageChannel,
  threadId: string,
) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: (params: {
      messageId: string
      senderName: string
      senderRole: string | null
      participantId?: string
    }) => publishDraftMessage(params.messageId, params.senderName, params.senderRole),

    onMutate: async ({ messageId }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData(messagesKey)

      queryClient.setQueryData(messagesKey, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) =>
            msg.id === messageId ? { ...msg, is_draft: false } : msg,
          ),
        }))
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

    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: messagesKey })
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
      toast.success('Сообщение отправлено')

      // Mark chat as read
      if (vars.participantId) {
        markAsRead(vars.participantId, projectId, channel, threadId)
          .then(() => {
            queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), 0)
            queryClient.invalidateQueries({
              queryKey: messengerKeys.lastReadAtByThreadId(threadId),
            })
            queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
          })
          .catch(() => {
            /* not critical */
          })
      }
    },
  })
}
