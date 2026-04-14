"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  retryTelegramSend,
  type ProjectMessage,
} from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

export function useRetryTelegramSend(threadId: string) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: (params: {
      message: ProjectMessage
      senderName: string
      senderRole: string | null
    }) => retryTelegramSend(params.message, params.senderName, params.senderRole),

    // Оптимистично "перезапускаем" сообщение: обнуляем признаки неудачи,
    // чтобы индикатор failed сбросился и появился pending на 30 секунд.
    onMutate: async ({ message }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData(messagesKey)

      const resetCreatedAt = new Date().toISOString()

      queryClient.setQueryData(messagesKey, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) =>
            msg.id === message.id
              ? {
                  ...msg,
                  telegram_attachments_delivered:
                    msg.attachments && msg.attachments.length > 0 ? null : msg.telegram_attachments_delivered,
                  // сдвигаем "точку отсчёта" таймера failed — чтобы useTelegramDeliveryStatus
                  // снова отсчитал 30 секунд и не показывал failed сразу же
                  created_at: resetCreatedAt,
                }
              : msg,
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
      toast.error('Не удалось отправить сообщение в Telegram')
    },

    onSuccess: () => {
      toast.success('Отправка в Telegram запущена')
      // Рефетч обновит telegram_message_id / telegram_attachments_delivered,
      // когда edge function запишет результат.
      queryClient.invalidateQueries({ queryKey: messagesKey })
    },
  })
}
