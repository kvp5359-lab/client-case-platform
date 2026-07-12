"use client"

/**
 * Отложенная отправка сообщений в тредах.
 *
 * Сообщение хранится как обычный черновик project_messages c
 * scheduled_send_at в будущем (флаги is_draft=true + scheduled_send_at).
 * Триггер notify_telegram_on_new_message эти строки пропускает. pg_cron
 * раз в минуту вызывает dispatch_scheduled_messages(), который снимает
 * флаги и отправляет через dispatch_message_to_channels.
 *
 * Минимальный шаг — 2 минуты от now (чтобы воркер успел подхватить).
 */

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  saveDraftMessage,
  type ProjectMessage,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys/messenger'

export const MIN_SCHEDULE_OFFSET_MS = 2 * 60 * 1000

type ScheduleMessageParams = {
  content: string
  sendAt: Date
  attachments?: File[]
  replyToId?: string | null
  senderParticipantId: string
  senderName: string
  senderRole: string | null
  visibility?: 'client' | 'team' | 'self'
  notifySubscribers?: boolean
}

export function useScheduleMessage(params: {
  projectId?: string
  workspaceId: string
  channel: MessageChannel
  threadId: string
}) {
  const { projectId, workspaceId, channel, threadId } = params
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: messengerKeys.messagesByThreadId(threadId) })
    queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
  }, [queryClient, threadId, workspaceId])

  /** Создать запланированное сообщение. */
  const scheduleMutation = useMutation({
    mutationFn: async (input: ScheduleMessageParams): Promise<ProjectMessage> => {
      const offsetMs = input.sendAt.getTime() - Date.now()
      if (offsetMs < MIN_SCHEDULE_OFFSET_MS) {
        throw new Error('Минимальная задержка — 2 минуты')
      }

      const draft = await saveDraftMessage({
        projectId,
        workspaceId,
        content: input.content,
        senderParticipantId: input.senderParticipantId,
        senderName: input.senderName,
        senderRole: input.senderRole,
        attachments: input.attachments,
        channel,
        threadId,
        visibility: input.visibility,
        notifySubscribers: input.notifySubscribers,
      })

      const { error } = await supabase
        .from('project_messages')
        .update({
          scheduled_send_at: input.sendAt.toISOString(),
          ...(input.replyToId ? { reply_to_message_id: input.replyToId } : {}),
        } as Record<string, unknown>)
        .eq('id', draft.id)

      if (error) {
        // Откат — снимем черновик, чтобы не оставался мусор.
        await supabase.from('project_messages').delete().eq('id', draft.id)
        throw error
      }

      return { ...draft, scheduled_send_at: input.sendAt.toISOString() } as ProjectMessage
    },
    onSuccess: invalidate,
  })

  /** Отменить — удалить запланированное сообщение. */
  const cancelMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('project_messages')
        .delete()
        .eq('id', messageId)
        .eq('is_draft', true)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  /** Перепланировать — обновить scheduled_send_at. */
  const rescheduleMutation = useMutation({
    mutationFn: async (input: { messageId: string; sendAt: Date }) => {
      const offsetMs = input.sendAt.getTime() - Date.now()
      if (offsetMs < MIN_SCHEDULE_OFFSET_MS) {
        throw new Error('Минимальная задержка — 2 минуты')
      }
      const { error } = await supabase
        .from('project_messages')
        .update({ scheduled_send_at: input.sendAt.toISOString() } as Record<string, unknown>)
        .eq('id', input.messageId)
        .eq('is_draft', true)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  /** Отправить сейчас — RPC снимает флаги + дёргает dispatch. */
  const sendNowMutation = useMutation({
    mutationFn: async (messageId: string) => {
      // Cast: RPC ещё не в сгенерированных типах database.ts.
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>
      )('publish_scheduled_message', { p_message_id: messageId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    schedule: scheduleMutation.mutateAsync,
    cancel: cancelMutation.mutateAsync,
    reschedule: rescheduleMutation.mutateAsync,
    sendNow: sendNowMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
  }
}

/** Пресеты времени для пикера. */
export type SchedulePreset = {
  label: string
  getDate: () => Date
}

export function getSchedulePresets(): SchedulePreset[] {
  return [
    {
      label: 'Через 15 минут',
      getDate: () => new Date(Date.now() + 15 * 60 * 1000),
    },
    {
      label: 'Через 1 час',
      getDate: () => new Date(Date.now() + 60 * 60 * 1000),
    },
    {
      label: 'Завтра в 9:00',
      getDate: () => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        d.setHours(9, 0, 0, 0)
        return d
      },
    },
    {
      label: 'Через неделю',
      getDate: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  ]
}
