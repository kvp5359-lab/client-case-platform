"use client"

/**
 * usePrefetchThreadMessages — префетч первой страницы сообщений треда в кэш
 * React Query по «намерению» (наведение/фокус на карточке треда на доске,
 * в списке, во входящих).
 *
 * Зачем: контент боковой панели гейтится `useProjectMessages(...).isLoading`.
 * Доска отдаёт метаданные треда сразу, но сообщения не префетчит → первый клик
 * по треду = холодный кэш = спиннер + сетевой запрос. Если успеть прогреть кэш
 * на наведении (тем же queryKey), к клику панель находит тёплый кэш и открывается
 * мгновенно — стандартный индустриальный паттерн (hover-prefetch + SWR).
 *
 * Ключ и форма данных ТОЧНО совпадают с `useProjectMessages` (тот же
 * `messengerKeys.messagesByThreadId`, тот же `getMessages` → `{messages,hasMore}`),
 * поэтому хук-панели переиспользует прогретую запись. `staleTime` гасит повторный
 * префетч при многократном наведении.
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getMessages } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'

export function usePrefetchThreadMessages() {
  const queryClient = useQueryClient()

  return useCallback(
    (threadId: string | null | undefined) => {
      if (!threadId) return
      void queryClient.prefetchInfiniteQuery({
        queryKey: messengerKeys.messagesByThreadId(threadId),
        queryFn: ({ pageParam }) =>
          getMessages(threadId, { before: pageParam as string | undefined }),
        initialPageParam: undefined as string | undefined,
        // Не перезапрашивать, если свежее этого порога уже в кэше (анти-спам ховера).
        staleTime: 30_000,
        // Выровнено с useProjectMessages — тред переживает в кэше до суток.
        gcTime: 24 * 60 * 60_000,
      })
    },
    [queryClient],
  )
}
