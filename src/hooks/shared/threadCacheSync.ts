"use client"

/**
 * threadCacheSync — единая точка точечной синхронизации кэшей инбокса при
 * локальных действиях над тредом (завершение / удаление).
 *
 * Зачем отдельный модуль. Список «Входящие» на доске и в /inbox питается из
 * тяжёлого пагинированного RPC `get_inbox_threads_page` (useInfiniteQuery).
 * Раньше завершение/удаление треда только инвалидировали этот кэш → строка
 * висела до завершения медленного refetch (на больших воркспейсах — секунды),
 * тогда как обычные списки (`get_workspace_threads`) обновлялись мгновенно.
 *
 * Здесь — точечные патчи кэша, которые дают мгновенный отклик, а тяжёлый
 * refetch остаётся лишь фоновой досверкой (и для realtime-событий извне).
 *
 * Важная асимметрия (см. WHERE в миграциях inbox-RPC):
 *  - RPC исключает только `is_deleted = true`. Удалённый тред сервер реально
 *    убирает → строку можно УДАЛИТЬ из кэша (removeThreadFromInboxCaches).
 *  - RPC НЕ фильтрует финальный статус. Завершённый тред остаётся в инбоксе и
 *    лишь становится прочитанным → строку НЕ удаляем, а гасим unread-поля
 *    (markThreadReadInInboxCaches). Тогда фильтр «Непрочитанные» прячет её
 *    мгновенно, а при фильтре «Все» она корректно остаётся.
 */

import type { QueryClient } from '@tanstack/react-query'
import { inboxKeys } from '@/hooks/queryKeys'
import {
  patchInboxThreadInCache,
  patchInboxAggregateInCache,
  removeInboxThreadFromCache,
  removeInboxAggregateFromCache,
  type InboxInfiniteData,
} from '@/hooks/messenger/useInbox'
import type { InboxThreadAggregate } from '@/services/api/inboxService'

/**
 * Тред переведён в финальный статус → погасить его unread-показатели в обоих
 * инбокс-кэшах (список + агрегаты для сайдбар-бейджей). Строку не удаляем.
 */
export function markThreadReadInInboxCaches(
  queryClient: QueryClient,
  workspaceId: string,
  threadId: string,
) {
  patchInboxThreadInCache(
    queryClient,
    workspaceId,
    (t) => t.thread_id === threadId,
    (t) => ({
      ...t,
      unread_count: 0,
      manually_unread: false,
      has_unread_reaction: false,
      unread_reaction_count: 0,
      unread_event_count: 0,
    }),
  )
  patchInboxAggregateInCache(
    queryClient,
    workspaceId,
    (t) => t.thread_id === threadId,
    (t) => ({
      ...t,
      unread_count: 0,
      manually_unread: false,
      has_unread_reaction: false,
      unread_reaction_count: 0,
      unread_event_count: 0,
    }),
  )
}

/** Снимок обоих инбокс-кэшей для отката optimistic-удаления. */
type InboxSnapshot = {
  threads: InboxInfiniteData | undefined
  aggregates: InboxThreadAggregate[] | undefined
}

/**
 * Тред удалён (is_deleted) → убрать строку из обоих инбокс-кэшей сразу.
 * Возвращает функцию отката: вызвать в onError мутации, чтобы восстановить
 * снимок при сбое запроса.
 */
export function removeThreadFromInboxCaches(
  queryClient: QueryClient,
  workspaceId: string,
  threadId: string,
): () => void {
  const snapshot: InboxSnapshot = {
    threads: queryClient.getQueryData<InboxInfiniteData>(inboxKeys.threads(workspaceId)),
    aggregates: queryClient.getQueryData<InboxThreadAggregate[]>(
      inboxKeys.aggregates(workspaceId),
    ),
  }

  removeInboxThreadFromCache(queryClient, workspaceId, threadId)
  removeInboxAggregateFromCache(queryClient, workspaceId, threadId)

  return () => {
    queryClient.setQueryData(inboxKeys.threads(workspaceId), snapshot.threads)
    queryClient.setQueryData(inboxKeys.aggregates(workspaceId), snapshot.aggregates)
  }
}
