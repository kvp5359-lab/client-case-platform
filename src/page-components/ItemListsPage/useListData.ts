"use client"

/**
 * Серверно-фильтрованные данные одного item_list (Фаза 1 перф-доработки).
 *
 * Раньше списки грузили ВЕСЬ воркспейс (useWorkspaceThreads / useAccessibleProjects)
 * и фильтровали на клиенте — на больших воркспейсах это тянуло тысячи строк и
 * фризило UI. Теперь список (= один фильтр) отправляет его на сервер и получает
 * только подходящие строки, как это уже делают доски (вариант A — prefilter).
 *
 * Переиспользуем инфраструктуру досок целиком:
 *   - RPC get_board_filtered_threads / get_board_filtered_projects;
 *   - сервис boardFilterService (постраничная загрузка .range, обходит лимит 1000);
 *   - ключи boardFilteredKeys (тот же кэш, что у досок) — поэтому правки статуса/
 *     дедлайна, инвалидирующие префикс ['workspace-threads', ws] / ['accessible-
 *     projects', ws], обновляют и список автоматически.
 *
 * Сервер сужает ГРУБО (с запасом: даты/__creator__ → true, неразрешённый __me__ →
 * noop), клиентский движок (useFilteredTasks/Projects в *TableView) дорезает ТОЧНО
 * по тому же фильтру и сортирует. Итоговый набор идентичен прежнему клиентскому —
 * меняется только объём данных по сети.
 *
 * ⚠️ Контракт __me__: server-lowering и клиентский FilterContext ОБЯЗАНЫ получать
 * одинаковые ids. Здесь оба используют currentParticipantId=null (как в *TableView),
 * поэтому assignee=__me__ сервер не сужает (noop → superset), а клиент фильтрует
 * как раньше. При желании включить серверное сужение по исполнителю — резолвить
 * participantId и передавать его И сюда, И в FilterContext одновременно.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { boardFilteredKeys, STALE_TIME } from '@/hooks/queryKeys'
import { lowerFilterForServer } from '@/lib/filters/lowerForServer'
import { getBoardFilteredThreads, getBoardFilteredProjects } from '@/services/api/boardFilterService'
import type { FilterGroup } from '@/lib/filters/types'

/** Ids для разворачивания __me__ при серверном сужении. См. контракт в шапке. */
const LIST_SERVER_IDS = { currentParticipantId: null, currentUserId: null }

export function useListThreads(workspaceId: string, filter: FilterGroup) {
  const { user } = useAuth()
  const serverFilter = useMemo(() => lowerFilterForServer(filter, LIST_SERVER_IDS), [filter])
  const filterKey = useMemo(() => JSON.stringify(serverFilter), [serverFilter])

  return useQuery({
    queryKey: boardFilteredKeys.threads(workspaceId, user?.id, filterKey),
    queryFn: () => getBoardFilteredThreads(workspaceId, user!.id, serverFilter),
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.SHORT,
  })
}

export function useListProjects(workspaceId: string, filter: FilterGroup) {
  const { user } = useAuth()
  const serverFilter = useMemo(() => lowerFilterForServer(filter, LIST_SERVER_IDS), [filter])
  const filterKey = useMemo(() => JSON.stringify(serverFilter), [serverFilter])

  return useQuery({
    queryKey: boardFilteredKeys.projects(workspaceId, user?.id, filterKey),
    queryFn: () => getBoardFilteredProjects(workspaceId, user!.id, serverFilter),
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.MEDIUM,
  })
}
