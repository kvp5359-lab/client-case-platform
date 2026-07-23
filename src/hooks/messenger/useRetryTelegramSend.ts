"use client"

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import {
  deliverEmailAttachments,
  isEmailChannelThread,
} from '@/services/api/messenger/deliverEmailAttachments'
import { messengerKeys } from '@/hooks/queryKeys'
import { watchSendStatusSettled } from './watchSendStatusSettled'

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
      if (!(await isEmailChannelThread(params.message.thread_id))) return

      const result = await deliverEmailAttachments({
        messageId: params.message.id,
        workspaceId: params.message.workspace_id,
        projectId: params.message.project_id ?? null,
        threadId: params.message.thread_id,
        senderParticipantId: params.message.sender_participant_id ?? null,
        content: params.message.content ?? null,
        attachmentNames: (params.message.attachments ?? []).map((a) => a.file_name),
      })
      if (!result.ok) {
        // 🔴 Обязательно вернуть строку в failed: этот путь идёт мимо
        // серверного диспетчера, а значит и мимо watchdog `scan_dispatch_failures`
        // (он сверяет только записи `message_send_dispatch`). Оставленный
        // `pending` завис бы навсегда — и кнопки «Повторить» у него уже нет,
        // она показывается только для `failed`.
        await supabase
          .from('project_messages')
          .update({
            send_status: 'failed',
            send_failed_reason:
              result.error instanceof Error ? result.error.message.slice(0, 500) : 'email send failed',
          })
          .eq('id', params.message.id)
        throw result.error instanceof Error ? result.error : new Error('email send failed')
      }
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

    onSuccess: (_data, { message }) => {
      toast.success('Отправка запущена')
      queryClient.invalidateQueries({ queryKey: messagesKey })
      // Страховка от «глухого» realtime — как у обычной отправки: если статус
      // в кэше не станет финальным, перечитаем сами (см. watchSendStatusSettled).
      watchSendStatusSettled(queryClient, threadId, [message.id])
    },
  })
}
