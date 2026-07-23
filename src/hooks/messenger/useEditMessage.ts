"use client"

/**
 * Хук для редактирования сообщения с optimistic update
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  editMessage,
  type ProjectMessage,
} from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

/**
 * Хук для редактирования сообщения с optimistic update.
 * После audit S1 cleanup: threadId обязательный, legacy-режим удалён.
 */
export function useEditMessage(threadId: string) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: ({
      messageId,
      content,
      senderName,
      senderRole,
    }: {
      messageId: string
      content: string
      senderName: string
      senderRole: string | null
    }) => editMessage(messageId, content, senderName, senderRole),

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
          messages: page.messages.map((msg) =>
            msg.id === messageId ? { ...msg, content, is_edited: true } : msg,
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
      toast.error('Не удалось отредактировать сообщение')
    },

    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: messagesKey })
      // Правка сохранилась в сервисе, но канал её не принял (напр. лимит
      // подписи Telegram 1024) — раньше это глоталось молча, и текст в ЛК
      // тихо расходился с Telegram (инцидент 2026-07-23).
      if (result.channelWarning) {
        toast.warning(result.channelWarning, { duration: 8000 })
      }
    },
  })
}
