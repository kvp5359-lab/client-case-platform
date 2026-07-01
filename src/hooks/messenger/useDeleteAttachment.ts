"use client"

/**
 * Хук удаления ОДНОГО вложения сообщения (не всего сообщения).
 *
 * Optimistic: сразу убирает файл из сообщения в кэше. По итогу сервиса честно
 * сообщает пользователю, удалился ли файл во внешнем канале (`channel: deleted`)
 * или остался там (`channel: kept` + причина). Если после удаления сообщение
 * стало пустым (нет текста и файлов) — сервис удаляет его целиком, и мы убираем
 * сообщение из кэша.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  deleteAttachment,
  type ProjectMessage,
} from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

type MessagesCache =
  | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
  | undefined

export function useDeleteAttachment(threadId: string) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: (args: { attachmentId: string; messageId: string }) =>
      deleteAttachment(args.attachmentId, args.messageId),

    onMutate: async ({ attachmentId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData(messagesKey)
      queryClient.setQueryData(messagesKey, (old: unknown) => {
        const typed = old as MessagesCache
        if (!typed) return typed
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) =>
            msg.id === messageId
              ? { ...msg, attachments: (msg.attachments ?? []).filter((a) => a.id !== attachmentId) }
              : msg,
          ),
        }))
        return { ...typed, pages }
      })
      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(messagesKey, context.previous)
      toast.error('Не удалось удалить файл')
    },

    onSuccess: (result, { messageId }) => {
      // Сообщение стало пустым — убрать его целиком из кэша.
      if (result.messageEmptied) {
        queryClient.setQueryData(messagesKey, (old: unknown) => {
          const typed = old as MessagesCache
          if (!typed) return typed
          const pages = typed.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== messageId),
          }))
          return { ...typed, pages }
        })
      }

      if (result.channel === 'kept' && result.reason) {
        toast('Файл удалён у нас', { description: `В канале останется — ${result.reason}` })
      } else {
        toast.success('Файл удалён')
      }

      // Сверка с сервером (has_attachments/удаление строки уже отражены в БД;
      // inbox-превью обновится через realtime-broadcast на project_messages).
      queryClient.invalidateQueries({ queryKey: messagesKey })
    },
  })
}
