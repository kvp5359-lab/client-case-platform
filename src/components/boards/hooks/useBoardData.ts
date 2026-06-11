"use client"

/**
 * Серверно-фильтрованные данные доски (вариант A — union-prefilter).
 *
 * Вместо загрузки всего воркспейса (useWorkspaceThreads/useAccessibleProjects)
 * доска отправляет union-фильтр (OR фильтров всех списков) и получает только
 * подходящие строки. Клиентский движок дорезает их по каждому списку точно.
 *
 * Ключ запроса включает сериализованный фильтр — при смене фильтров списков
 * запрос перевыбирается сам.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { boardFilteredKeys, STALE_TIME } from '@/hooks/queryKeys'
import { buildBoardServerFilter } from '@/lib/filters/lowerForServer'
import { getBoardFilteredThreads, getBoardFilteredProjects } from '@/services/api/boardFilterService'
import type { BoardGlobalFilter, BoardList } from '../types'

function useBoardUnionFilter(
  lists: BoardList[],
  boardGlobalFilter: BoardGlobalFilter | undefined,
  entityType: 'thread' | 'project',
  currentParticipantId: string | null,
  currentUserId: string | null,
) {
  return useMemo(
    () =>
      buildBoardServerFilter(lists, boardGlobalFilter, entityType, {
        currentParticipantId,
        currentUserId,
      }),
    [lists, boardGlobalFilter, entityType, currentParticipantId, currentUserId],
  )
}

export function useBoardThreads(
  workspaceId: string,
  lists: BoardList[],
  boardGlobalFilter: BoardGlobalFilter | undefined,
  currentParticipantId: string | null,
  enabled: boolean,
) {
  const { user } = useAuth()
  const filter = useBoardUnionFilter(lists, boardGlobalFilter, 'thread', currentParticipantId, user?.id ?? null)
  const filterKey = useMemo(() => JSON.stringify(filter), [filter])

  return useQuery({
    queryKey: boardFilteredKeys.threads(workspaceId, user?.id, filterKey),
    queryFn: () => getBoardFilteredThreads(workspaceId, user!.id, filter),
    enabled: enabled && !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.SHORT,
  })
}

export function useBoardProjects(
  workspaceId: string,
  lists: BoardList[],
  boardGlobalFilter: BoardGlobalFilter | undefined,
  currentParticipantId: string | null,
  enabled: boolean,
) {
  const { user } = useAuth()
  const filter = useBoardUnionFilter(lists, boardGlobalFilter, 'project', currentParticipantId, user?.id ?? null)
  const filterKey = useMemo(() => JSON.stringify(filter), [filter])

  return useQuery({
    queryKey: boardFilteredKeys.projects(workspaceId, user?.id, filterKey),
    queryFn: () => getBoardFilteredProjects(workspaceId, user!.id, filter),
    enabled: enabled && !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.MEDIUM,
  })
}
