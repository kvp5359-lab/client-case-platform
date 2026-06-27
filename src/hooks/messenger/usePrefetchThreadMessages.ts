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
import {
  getMessages,
  getThreadLastReadAtForUser,
  resolveParticipantFull,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, messengerParticipantKeys } from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'

export function usePrefetchThreadMessages() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { workspaceId } = useWorkspaceContext()

  return useCallback(
    (threadId: string | null | undefined, projectId?: string | null) => {
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
      // Тем же hover'ом греем last_read_at (красный контур непрочитанного) —
      // ТОТ ЖЕ ключ и queryFn, что у useLastReadAt. Без этого сообщения приходят
      // из тёплого кэша мгновенно, а контур ждёт отдельный сетевой запрос (~RTT)
      // и появляется с заметной паузой после сообщений.
      if (user && workspaceId) {
        void queryClient.prefetchQuery({
          queryKey: messengerKeys.lastReadAtByThreadId(threadId),
          queryFn: () => getThreadLastReadAtForUser(workspaceId, user.id, threadId),
          staleTime: 30_000,
        })
        // И «мою личность» в треде (currentParticipant) — от неё зависит isOwn
        // (сторона/цвет бабблов). Без прогрева при первом открытии треда проекта
        // currentParticipant ещё не резолвлен → ВСЕ сообщения рисуются как чужие
        // (слева, серые), потом с задержкой свои перекрашиваются и уезжают вправо.
        // ТОТ ЖЕ ключ/queryFn/staleTime, что в useMessengerState.
        const scopeId = projectId ?? workspaceId
        void queryClient.prefetchQuery({
          queryKey: messengerParticipantKeys.current(scopeId, user.id),
          queryFn: () => resolveParticipantFull(projectId ?? undefined, workspaceId, user.id),
          staleTime: Infinity,
        })
      }
    },
    [queryClient, user, workspaceId],
  )
}
