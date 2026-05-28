"use client"

/**
 * Читает counterpart_name (имя собеседника) для треда из кэша inbox v2.
 * Подписывается через useSyncExternalStore — без своего queryFn, чтобы не
 * затирать кэш пустым массивом (тот же паттерн, что в UnreadBadge).
 *
 * Используется как fallback для отображения «проекта» в карточках/списках:
 * если у треда нет project_name, показываем имя клиента/контрагента.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { inboxKeys } from '@/hooks/queryKeys'
import type { InboxInfiniteData } from './useInbox'

export function useThreadCounterpartName(
  threadId: string,
  workspaceId: string,
): string | null {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => inboxKeys.threads(workspaceId), [workspaceId])

  const data = useSyncExternalStore<InboxInfiniteData | undefined>(
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

  return useMemo(() => {
    if (!data?.pages) return null
    for (const page of data.pages) {
      const entry = page.items.find((e) => e.thread_id === threadId)
      if (entry) return entry.counterpart_name ?? null
    }
    return null
  }, [data, threadId])
}
