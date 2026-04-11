"use client"

/**
 * React Query хуки для вкладки «История»
 */

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { historyKeys } from './queryKeys'
import {
  getProjectHistory,
  getHistoryUnreadCount,
  markHistoryAsRead,
} from '@/services/api/historyService'
import type { HistoryFilters } from '@/types/history'
import { STALE_TIME } from '@/hooks/queryKeys'

/**
 * Бесконечная лента истории проекта с cursor-based пагинацией
 */
export function useProjectHistory(projectId: string, filters?: HistoryFilters) {
  return useInfiniteQuery({
    queryKey: [...historyKeys.byProject(projectId), filters],
    queryFn: ({ pageParam }) => getProjectHistory(projectId, pageParam, 30, filters),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 30) return undefined
      return lastPage[lastPage.length - 1]?.created_at
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/**
 * Счётчик непрочитанных событий (для бейджа на вкладке)
 */
export function useHistoryUnreadCount(projectId: string) {
  return useQuery({
    queryKey: historyKeys.unreadCount(projectId),
    queryFn: () => getHistoryUnreadCount(projectId),
    enabled: !!projectId,
    staleTime: STALE_TIME.SHORT,
  })
}

/**
 * Мутация «пометить историю как прочитанную»
 */
export function useMarkHistoryAsRead(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => markHistoryAsRead(projectId),
    onSuccess: () => {
      queryClient.setQueryData(historyKeys.unreadCount(projectId), 0)
    },
  })
}
