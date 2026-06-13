"use client"

/**
 * Читает counterpart_name (имя собеседника) для тредов из кэша inbox v2.
 * Подписывается через useSyncExternalStore — без своего queryFn, чтобы не
 * затирать кэш пустым массивом (тот же паттерн, что в UnreadBadge).
 *
 * Используется как fallback для отображения «проекта» в карточках/списках:
 * если у треда нет project_name, показываем имя клиента/контрагента.
 *
 * ⚠️ Производительность (P4b перф-аудита): в таблицах задач/списков (/tasks,
 * /lists, доски) ВЫЗЫВАТЬ `useThreadCounterpartNameMap` ОДИН раз на уровне
 * таблицы и раздавать значение пропом в строки, а НЕ звать одиночный
 * `useThreadCounterpartName` в каждой строке. Иначе каждая из ~1000 строк
 * подписывается на весь queryCache и на любое кэш-событие линейно сканит
 * pages[].items.find(...) → O(N×pages×items). Карта строится один раз.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxInfiniteData } from './useInbox'

/** Общая подписка на кэш inbox v2 по ключу threads(workspaceId). */
function useInboxThreadsCache(
  queryClient: QueryClient,
  workspaceId: string,
): InboxInfiniteData | undefined {
  const queryKey = useMemo(() => inboxKeys.threads(workspaceId), [workspaceId])

  return useSyncExternalStore<InboxInfiniteData | undefined>(
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
    () => queryClient.getQueryData<InboxInfiniteData>(queryKey),
    () => undefined,
  )
}

/**
 * Карта thread_id → counterpart_name по всему загруженному inbox-кэшу.
 * Одна подписка + один проход. Звать на уровне таблицы, значение раздавать
 * пропом в строки (см. предупреждение выше).
 */
export function useThreadCounterpartNameMap(
  workspaceId: string,
): Map<string, string | null> {
  const queryClient = useQueryClient()
  const data = useInboxThreadsCache(queryClient, workspaceId)

  return useMemo(() => {
    const map = new Map<string, string | null>()
    if (!data?.pages) return map
    for (const page of data.pages) {
      for (const e of page.items) {
        if (!map.has(e.thread_id)) map.set(e.thread_id, e.counterpart_name ?? null)
      }
    }
    return map
  }, [data])
}

/**
 * Одиночный вариант для standalone-мест (НЕ списки/таблицы — там карта).
 */
export function useThreadCounterpartName(
  threadId: string,
  workspaceId: string,
): string | null {
  const queryClient = useQueryClient()
  const data = useInboxThreadsCache(queryClient, workspaceId)

  return useMemo(() => {
    if (!data?.pages) return null
    for (const page of data.pages) {
      const entry = page.items.find((e) => e.thread_id === threadId)
      if (entry) return entry.counterpart_name ?? null
    }
    return null
  }, [data, threadId])
}
