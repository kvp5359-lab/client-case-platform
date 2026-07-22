"use client"

/**
 * Read-only подписка на ПОЛНЫЙ кэш агрегатов инбокса (`inboxKeys.aggregates`,
 * RPC `get_inbox_thread_aggregates` — без пагинации).
 *
 * Зачем отдельный хук: кэш наполняет сайдбар на каждой странице
 * (`useSidebarInboxCounts`), realtime его инвалидирует. Потребителям (бейджи)
 * нужен только доступ на чтение — БЕЗ собственного `queryFn`: при нескольких
 * observer-ах одного queryKey React Query 5 мог взять «пустой» queryFn и
 * положить в кэш `[]`, после чего у всех тредов разом исчезали бейджи.
 * Поэтому useSyncExternalStore, а не useQuery (см. историю в UnreadBadge).
 *
 * ⚠️ Это НЕ пагинированный `inboxKeys.threads` (там только первая страница
 * инбокса ~50 тредов) — агрегаты полные, поэтому подходят для тредов с любой
 * страницы.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxThreadAggregate } from '@/services/api/inboxService'

export function useInboxAggregatesCache(
  workspaceId: string | undefined,
): InboxThreadAggregate[] | undefined {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => inboxKeys.aggregates(workspaceId ?? ''),
    [workspaceId],
  )

  return useSyncExternalStore<InboxThreadAggregate[] | undefined>(
    (onChange) => {
      const cache = queryClient.getQueryCache()
      return cache.subscribe((event) => {
        const evKey = event.query.queryKey
        if (
          !Array.isArray(evKey) ||
          evKey.length !== queryKey.length ||
          evKey[0] !== queryKey[0] ||
          evKey[1] !== queryKey[1] ||
          evKey[2] !== queryKey[2]
        ) {
          return
        }
        onChange()
      })
    },
    () => (workspaceId ? queryClient.getQueryData<InboxThreadAggregate[]>(queryKey) : undefined),
    () => undefined,
  )
}

/**
 * Смешаны ли непрочитанные сообщения треда по видимости («Всем» + «Команде»).
 * Источник — тот же полный кэш агрегатов. Нет данных (кэш ещё не загружен или
 * нет workspaceId) → false, бейдж просто останется цветом акцента.
 */
export function useThreadMixedUnread(
  workspaceId: string | undefined,
  threadId: string,
): boolean {
  const data = useInboxAggregatesCache(workspaceId)
  return useMemo(
    () => data?.find((e) => e.thread_id === threadId)?.has_mixed_unread ?? false,
    [data, threadId],
  )
}
