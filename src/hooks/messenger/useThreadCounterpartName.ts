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

function buildCounterpartMap(data: InboxInfiniteData | undefined): Map<string, string | null> {
  const map = new Map<string, string | null>()
  if (!data?.pages) return map
  for (const page of data.pages) {
    for (const e of page.items) {
      if (!map.has(e.thread_id)) map.set(e.thread_id, e.counterpart_name ?? null)
    }
  }
  return map
}

function mapsEqual(a: Map<string, string | null>, b: Map<string, string | null>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (!b.has(k) || b.get(k) !== v) return false
  }
  return true
}

/**
 * Карта thread_id → counterpart_name по всему загруженному inbox-кэшу.
 * Одна подписка + один проход. Звать на уровне таблицы, значение раздавать
 * пропом в строки (см. предупреждение выше).
 *
 * ⚠️ Стабильность ссылки (перф-фикс 2026-07-23): inbox-кэш рефетчится каждым
 * realtime-тиком (~1.5с на активном воркспейсе) и получает НОВУЮ ссылку данных,
 * хотя имена собеседников меняются редко. Если возвращать новую Map на каждый
 * тик, все memo-потребители (BoardListCard и др.) ре-рендерятся зря. Поэтому
 * снапшот кэшируется: карта пересобирается при смене данных, но если содержимое
 * НЕ изменилось — возвращается прежняя ссылка.
 */
type CounterpartStore = {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => Map<string, string | null>
  getServerSnapshot: () => Map<string, string | null>
}

// Сторы живут на модульном уровне (WeakMap по queryClient → Map по workspaceId):
// кэш снапшота нельзя держать в ref/замыкании рендера (react-hooks/immutability),
// а getSnapshot обязан возвращать стабильную ссылку, пока содержимое эквивалентно.
const counterpartStores = new WeakMap<QueryClient, Map<string, CounterpartStore>>()

function getCounterpartStore(queryClient: QueryClient, workspaceId: string): CounterpartStore {
  let byWs = counterpartStores.get(queryClient)
  if (!byWs) {
    byWs = new Map()
    counterpartStores.set(queryClient, byWs)
  }
  const existing = byWs.get(workspaceId)
  if (existing) return existing

  const queryKey = inboxKeys.threads(workspaceId)
  let cachedData: InboxInfiniteData | undefined
  let cachedMap: Map<string, string | null> = new Map()

  const store: CounterpartStore = {
    subscribe: (onChange: () => void) => {
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
    getSnapshot: () => {
      const data = queryClient.getQueryData<InboxInfiniteData>(queryKey)
      if (data === cachedData) return cachedMap
      const next = buildCounterpartMap(data)
      cachedData = data
      if (!mapsEqual(cachedMap, next)) cachedMap = next
      return cachedMap
    },
    getServerSnapshot: () => cachedMap,
  }
  byWs.set(workspaceId, store)
  return store
}

export function useThreadCounterpartNameMap(
  workspaceId: string,
): Map<string, string | null> {
  const queryClient = useQueryClient()
  const store = getCounterpartStore(queryClient, workspaceId)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
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
