"use client"

/**
 * Хелпер: если новый статус треда финальный (is_final=true) — помечает
 * тред прочитанным. Используется при смене статуса из любых точек: карточка
 * задачи, настройки чата, пакетные операции в списках, боковая панель.
 *
 * Помимо записи в `message_read_status` точечно гасит unread_count в кэшах
 * React Query (`unreadCountByThreadId`, `inboxKeys.threads`), отменяя
 * параллельные realtime-рефетчи, которые могут вернуть устаревший counter.
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { markAsRead } from '@/services/api/messenger/messengerReadStatusService'
import {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
} from '@/services/api/messenger/messengerParticipantService'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'

type MarkParams = {
  threadId: string
  statusId: string | null
  projectId: string | null | undefined
  workspaceId: string | null | undefined
}

export function useMarkThreadReadIfFinal() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useCallback(
    async ({ threadId, statusId, projectId, workspaceId }: MarkParams) => {
      if (!statusId || !user?.id) return

      const { data: status } = await supabase
        .from('statuses')
        .select('is_final')
        .eq('id', statusId)
        .maybeSingle()
      if (!status?.is_final) return

      // Личные диалоги (project_id=NULL, type='email'/'chat') — participant ищем
      // на уровне воркспейса. Иначе — проектный participant.
      const participant = projectId
        ? await getCurrentProjectParticipant(projectId, user.id)
        : workspaceId
          ? await getCurrentWorkspaceParticipant(workspaceId, user.id)
          : null
      if (!participant) return

      try {
        await markAsRead(participant.participantId, projectId ?? undefined, 'client', threadId)
        queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), 0)
        // Красная полоса «непрочитанного» на конкретных баблах рисуется по last_read_at —
        // без инвалидации эти ключи остаются на старом значении до перезагрузки.
        queryClient.invalidateQueries({ queryKey: messengerKeys.lastReadAtByThreadId(threadId) })
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: messengerKeys.lastReadAtByProjectPrefix(projectId),
          })
        }

        if (workspaceId) {
          const inboxKey = inboxKeys.threads(workspaceId)
          await queryClient.cancelQueries({ queryKey: inboxKey })
          queryClient.setQueryData<InboxThreadEntry[]>(inboxKey, (prev) => {
            if (!prev) return prev
            return prev.map((t) =>
              t.thread_id === threadId
                ? {
                    ...t,
                    unread_count: 0,
                    manually_unread: false,
                    has_unread_reaction: false,
                    unread_reaction_count: 0,
                    unread_event_count: 0,
                  }
                : t,
            )
          })
        }
      } catch {
        // Не критично — статус уже обновлён
      }
    },
    [queryClient, user],
  )
}
