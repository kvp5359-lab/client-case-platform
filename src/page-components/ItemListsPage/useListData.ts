"use client"

/**
 * Серверно-фильтрованные + постранично подгружаемые данные одного item_list.
 *
 * Фаза 1 (серверная фильтрация) + Вариант A (настоящая пагинация по скроллу).
 * Список НЕ грузит весь воркспейс: сервер фильтрует (через ту же инфраструктуру
 * досок — get_board_filtered_threads/projects), сортирует и отдаёт страницами
 * по LIST_PAGE_SIZE (через PostgREST .order()/.range(), без новой миграции).
 * Клиентский движок (useFilteredTasks/Projects в *TableView) дорезает каждую
 * загруженную страницу ТОЧНО (даты/__creator__), сохраняя серверный порядок.
 *
 * useInfiniteQuery: первая страница на маунте, остальные — по достижении конца
 * прокрутки (onEndReached из TableShell). Исполнители (useTaskAssigneesMap) при
 * этом грузятся только для уже загруженных строк — оверфетч на весь список ушёл.
 *
 * ⚠️ Контракт __me__: server-lowering и клиентский FilterContext держат
 * одинаковые ids (оба currentParticipantId=null, как в *TableView).
 */

import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { boardFilteredKeys, STALE_TIME } from '@/hooks/queryKeys'
import { lowerFilterForServer } from '@/lib/filters/lowerForServer'
import {
  getListThreadsPage,
  getListProjectsPage,
  LIST_PAGE_SIZE,
} from '@/services/api/boardFilterService'
import type { FilterGroup } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/types/board'

const LIST_SERVER_IDS = { currentParticipantId: null, currentUserId: null }

type SortDir = 'asc' | 'desc'

export function useListThreads(
  workspaceId: string,
  filter: FilterGroup,
  sortBy: string | null,
  sortDir: SortDir,
) {
  const { user } = useAuth()
  const serverFilter = useMemo(() => lowerFilterForServer(filter, LIST_SERVER_IDS), [filter])
  const filterKey = useMemo(() => JSON.stringify(serverFilter), [serverFilter])

  const query = useInfiniteQuery({
    queryKey: [...boardFilteredKeys.threads(workspaceId, user?.id, filterKey), 'page', sortBy, sortDir],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getListThreadsPage(workspaceId, user!.id, serverFilter, sortBy, sortDir, pageParam as number),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === LIST_PAGE_SIZE ? allPages.length * LIST_PAGE_SIZE : undefined,
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.SHORT,
  })

  const rows = useMemo<WorkspaceTask[]>(
    () => query.data?.pages.flat() ?? [],
    [query.data],
  )
  return { rows, ...query }
}

export function useListProjects(
  workspaceId: string,
  filter: FilterGroup,
  sortBy: string | null,
  sortDir: SortDir,
) {
  const { user } = useAuth()
  const serverFilter = useMemo(() => lowerFilterForServer(filter, LIST_SERVER_IDS), [filter])
  const filterKey = useMemo(() => JSON.stringify(serverFilter), [serverFilter])

  const query = useInfiniteQuery({
    queryKey: [...boardFilteredKeys.projects(workspaceId, user?.id, filterKey), 'page', sortBy, sortDir],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getListProjectsPage(workspaceId, user!.id, serverFilter, sortBy, sortDir, pageParam as number),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === LIST_PAGE_SIZE ? allPages.length * LIST_PAGE_SIZE : undefined,
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.MEDIUM,
  })

  const rows = useMemo(() => query.data?.pages.flat() ?? [], [query.data])
  return { rows, ...query }
}
