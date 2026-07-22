"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import {
  resolveThreadChannel,
  type ThreadChannelSignals,
} from '@/services/api/messenger/resolveThreadChannel'
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
 *
 * 🪤 Исключение — ПИСЬМО С ВЛОЖЕНИЯМИ: `dispatch_message_to_channels` его
 * архитектурно пропускает (`has_attachments` → RETURN даже при force, иначе
 * двойная отправка с фронт-invoke'ом publishDraft). Один перевод в pending
 * оставил бы такое сообщение висеть «отправляется» навсегда — поэтому здесь
 * повторяем ровно тот же фронт-invoke, что и первичная отправка.
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

      // Письмо с вложениями сервер не переотправит (см. комментарий выше) —
      // добиваем фронт-invoke'ом, симметрично первичной отправке.
      const hasAttachments = (params.message.attachments?.length ?? 0) > 0
      if (!hasAttachments || !params.message.thread_id) return

      const { data: t } = await supabase
        .from('project_threads')
        .select(
          'type, email_send_account_id, wazzup_channel_id, wazzup_chat_id, mtproto_session_user_id, mtproto_client_tg_user_id, business_connection_id',
        )
        .eq('id', params.message.thread_id)
        .maybeSingle()
      if (resolveThreadChannel((t as ThreadChannelSignals) ?? {}) !== 'email') return

      await supabase.auth.getSession()
      const { error: invokeError } = await supabase.functions.invoke('email-internal-send', {
        body: { message_id: params.message.id },
      })
      if (invokeError) throw invokeError
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
