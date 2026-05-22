"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

/**
 * Кнопка «Повторить» под красным баблом «не доставлено».
 *
 * Раньше — отдельная edge function `retryTelegramSend`. После унификации
 * send_status (миграция 20260522_unified_send_status.sql) ретрай — это
 * просто перевод сообщения в `send_status='pending'`. БД-триггер
 * `notify_on_send_status_retry` ловит переход failed → pending и дёргает
 * `dispatch_message_to_channels`, который сам выбирает нужный канал
 * (Telegram group / business / mtproto / Wazzup / email).
 *
 * Имя сохранено как `useRetryTelegramSend` для совместимости с местами
 * вызова — фактически универсально для всех каналов.
 */
export function useRetryTelegramSend(threadId: string) {
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  return useMutation({
    mutationFn: async (params: { message: ProjectMessage }) => {
      const nowIso = new Date().toISOString()
      const { error } = await supabase
        .from('project_messages')
        .update({
          send_status: 'pending',
          send_failed_reason: null,
          send_attempted_at: nowIso,
        })
        .eq('id', params.message.id)
      if (error) throw error
    },

    // Оптимистично: локально сразу гасим красный бейдж, ставим pending.
    // Realtime-подписка догонит реальным send_status, когда edge function
    // запишет результат.
    onMutate: async ({ message }) => {
      await queryClient.cancelQueries({ queryKey: messagesKey })
      const previous = queryClient.getQueryData(messagesKey)
      const resetAt = new Date().toISOString()

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
                  send_status: 'pending' as const,
                  send_failed_reason: null,
                  send_attempted_at: resetAt,
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
      toast.error('Не удалось запустить повторную отправку')
    },

    onSuccess: () => {
      toast.success('Отправка запущена')
      queryClient.invalidateQueries({ queryKey: messagesKey })
    },
  })
}
