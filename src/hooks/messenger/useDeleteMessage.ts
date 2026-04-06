"use client"

/**
 * Хук для удаления сообщения с optimistic update
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  deleteMessage,
  type ProjectMessage,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

export function useDeleteMessage(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
) {
  const queryClient = useQueryClient()
  const messagesKey = threadId
    ? messengerKeys.messagesByThreadId(threadId)
    : messengerKeys.messages(projectId ?? '', channel)
  const unreadKey = threadId
    ? messengerKeys.unreadCountByThreadId(threadId)
    : messengerKeys.unreadCount(projectId ?? '', channel)

  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),

    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData(messagesKey)

      queryClient.setQueryData(messagesKey, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.filter((msg) => msg.id !== messageId),
        }))
        return { ...typed, pages }
      })

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesKey, context.previous)
      }
      toast.error('Не удалось удалить сообщение')
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey })
      queryClient.invalidateQueries({ queryKey: unreadKey })
    },
  })
}
