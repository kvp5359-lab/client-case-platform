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
import { markThreadReadInInboxCaches } from '@/hooks/shared/threadCacheSync'
import { dismissThreadToasts } from './useMessageToastPayload'

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
        // Снимаем висящие тосты по этому треду — он завершён, уведомления
        // по нему больше не актуальны. По суффиксу threadId, не по projectId,
        // чтобы покрыть и личные диалоги (project_id=NULL).
        dismissThreadToasts(threadId)
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
          // Отменяем in-flight refetch, чтобы он не перетёр патч устаревшими
          // данными, затем точечно гасим unread в обоих инбокс-кэшах.
          // Раньше здесь был inline-патч, типизированный под массив, тогда как
          // кэш инбокса — useInfiniteQuery ({pages}); вызов prev.map падал с
          // TypeError, который глушился внешним catch, и патч молча не
          // применялся (инбокс ждал тяжёлый refetch). Хелпер работает с
          // правильной структурой pages.
          await queryClient.cancelQueries({ queryKey: inboxKeys.threads(workspaceId) })
          markThreadReadInInboxCaches(queryClient, workspaceId, threadId)
        }
      } catch {
        // Не критично — статус уже обновлён
      }
    },
    [queryClient, user],
  )
}
