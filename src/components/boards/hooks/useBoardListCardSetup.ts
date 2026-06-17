"use client"

/**
 * Setup-хук для BoardListCard.
 *
 * Собирает в одном месте все memo/derives/effects, нужные для рендера
 * одной колонки доски: фильтры, сортировки, группировки, статусы,
 * участники, DnD-индикаторы и побочный эффект публикации порядка карточек
 * в BoardView registry.
 *
 * Паттерн повторяет useDocumentKitSetup — главный компонент остаётся
 * тонким оркестратором JSX.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDialog } from '@/hooks/shared/useDialog'
import { useFilteredTasks, useFilteredProjects } from './useFilteredListData'
import { useReorderBoardListItems } from './useBoardListItemOrders'
import { useUpdateList } from './useListMutations'
import { useWorkspaceProjectParticipants } from './useWorkspaceProjectParticipants'
import { useProjectPeopleByRole } from '@/hooks/useProjectPeopleByRole'
import { useCreateTaskHandler } from '@/components/tasks/useCreateTaskMutation'
import { useQueueThreadInitialMessage } from '@/components/tasks/useQueueThreadInitialMessage'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { newThreadToTaskItem } from '@/components/tasks/taskListConstants'
import { extractThreadCreatePreset } from '@/lib/filters/extractPreset'
import { mergeFilterGroupsAnd } from '@/lib/filters/types'
import { useAllProjectStatuses } from '@/hooks/useStatuses'
import type { NextTaskInfo } from '../BoardProjectRow'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { groupTasks, groupProjects } from '../boardListUtils'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import type { BoardCardDndState, BoardGlobalFilter, BoardList, GroupByField } from '../types'
import type { FilterContext } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { BoardProject } from './useWorkspaceProjects'
import type { BoardItemType } from './useBoardListItemOrders'

type Params = {
  list: BoardList
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  assigneesMap: Record<string, AvatarParticipant[]>
  filterCtx: FilterContext
  workspaceId: string
  statuses: StatusOption[]
  boardGlobalFilter?: BoardGlobalFilter
  boardCardDnd?: BoardCardDndState
}

export function useBoardListCardSetup({
  list,
  tasks,
  projects,
  assigneesMap,
  filterCtx,
  workspaceId,
  statuses,
  boardGlobalFilter,
  boardCardDnd,
}: Params) {
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null)
  const settingsDialog = useDialog()
  const createDialog = useDialog()
  // Слот календаря, выбранный пользователем кликом по пустому месту.
  // Подмешивается в initialValues create-диалога как startAt/endAt.
  const [calendarSlot, setCalendarSlot] = useState<{ start: string; end: string } | null>(null)

  const simpleAssigneesMap = useMemo(() => {
    const result: Record<string, { id: string }[]> = {}
    for (const [key, val] of Object.entries(assigneesMap)) {
      result[key] = val.map((a) => ({ id: a.id }))
    }
    return result
  }, [assigneesMap])

  const isProject = list.entity_type === 'project'
  const isInbox = list.entity_type === 'inbox'

  // Базовый фильтр списка + наложение board-level фильтра того же entity_type
  // через AND. Inbox имеет свою логику (default_filter) и по соглашению
  // игнорирует board.global_filter — у него обычных rules нет.
  const safeFilters = useMemo(() => {
    const listFilters = isInbox ? { logic: 'and' as const, rules: [] } : list.filters
    if (isInbox || !boardGlobalFilter) return listFilters
    const boardSlice =
      list.entity_type === 'project'
        ? boardGlobalFilter.project
        : list.entity_type === 'thread'
        ? boardGlobalFilter.thread
        : null
    if (!boardSlice) return listFilters
    return mergeFilterGroupsAnd(boardSlice, listFilters)
  }, [isInbox, boardGlobalFilter, list.filters, list.entity_type])

  const hasFilters = safeFilters.rules.length > 0

  // Preset для диалога создания: разворачиваем верхнеуровневые equals-условия
  // фильтра колонки в дефолтные значения формы. Делается только для thread-
  // колонок: на project-колонках кнопка не показывается, на inbox — тоже.
  const createPreset = useMemo(() => {
    if (list.entity_type !== 'thread') return undefined
    return extractThreadCreatePreset(safeFilters, filterCtx)
  }, [list.entity_type, safeFilters, filterCtx])

  const queueInitialMessage = useQueueThreadInitialMessage(workspaceId)
  const layoutPanel = useLayoutTaskPanel()

  const { handleCreate, isPending: createPending } = useCreateTaskHandler({
    workspaceId,
    projectId: createPreset?.projectId,
    onSuccess: async (newThread: ProjectThread, result: ChatSettingsResult) => {
      await queueInitialMessage(newThread, result)
      layoutPanel?.openThread(newThreadToTaskItem(newThread, result))
      createDialog.close()
    },
  })

  // Ближайшая активная задача проекта теперь считается на сервере
  // (get_board_filtered_projects → next_task_*) — не зависим от загрузки всех
  // тредов воркспейса. Раскладываем серверные поля в карты для рендера/сортировки.
  const nextTaskByProjectId = useMemo(() => {
    if (!isProject) return {}
    const byProject: Record<string, NextTaskInfo> = {}
    for (const p of projects) {
      if (p.next_task_name && p.next_task_deadline) {
        byProject[p.id] = { name: p.next_task_name, deadline: p.next_task_deadline }
      }
    }
    return byProject
  }, [isProject, projects])

  // Карта project_id → deadline ближайшей задачи (для сортировки в useFilteredProjects).
  const nextTaskDeadlineByProjectId = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const [pid, t] of Object.entries(nextTaskByProjectId)) {
      map[pid] = t.deadline
    }
    return map
  }, [nextTaskByProjectId])

  // Карта user_id (created_by) → имя участника для поля «Автор» в project-листах.
  // Участники воркспейса уже кэшируются на уровне WorkspaceLayout, так что
  // дополнительного запроса не будет — заглядываем в тот же кэш.
  const { data: participants = [] } = useWorkspaceParticipants(isProject ? workspaceId : undefined)
  const authorNameByUserId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of participants) {
      if (!p.user_id) continue
      map[p.user_id] = p.last_name ? `${p.name} ${p.last_name}` : p.name
    }
    return map
  }, [participants])

  const manualThreadPositions = boardCardDnd?.manualOrders?.[list.id]?.thread
  const manualProjectPositions = boardCardDnd?.manualOrders?.[list.id]?.project

  const filteredTasks = useFilteredTasks(
    list.entity_type === 'thread' ? tasks : [],
    safeFilters,
    filterCtx,
    simpleAssigneesMap,
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
    manualThreadPositions,
  )

  // «Сортировать по сроку» (пункт меню списка): задачи с дедлайном — вперёд,
  // по возрастанию с учётом времени; остальные сохраняют текущий порядок.
  // Пишется как ручной порядок (manual_order), поэтому, если список не в этом
  // режиме, переводим его туда — иначе сохранённый порядок будет проигнорирован.
  const reorderItems = useReorderBoardListItems()
  const updateList = useUpdateList()
  const sortByDeadline = useCallback(() => {
    if (list.entity_type !== 'thread') return
    const withDeadline = filteredTasks
      .filter((t) => t.deadline)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    const withoutDeadline = filteredTasks.filter((t) => !t.deadline)
    const itemIds = [...withDeadline, ...withoutDeadline].map((t) => t.id)
    if (itemIds.length === 0) return
    reorderItems.mutate({
      board_id: list.board_id,
      list_id: list.id,
      item_type: 'thread',
      item_ids: itemIds,
    })
    if (list.sort_by !== 'manual_order') {
      updateList.mutate({ id: list.id, board_id: list.board_id, sort_by: 'manual_order' })
    }
  }, [filteredTasks, list, reorderItems, updateList])

  const { data: projectParticipantsMap } = useWorkspaceProjectParticipants(
    workspaceId,
    isProject,
  )

  // Участники проектов по ролям — для роль-полей карточки (Исполнители/
  // Администраторы/Клиенты/Наблюдатели). Грузим только в project-листах.
  const projectIds = useMemo(
    () => (isProject ? projects.map((p) => p.id) : []),
    [isProject, projects],
  )
  const peopleByRole = useProjectPeopleByRole(projectIds)

  const filteredProjects = useFilteredProjects(
    isProject ? projects : [],
    safeFilters,
    filterCtx,
    projectParticipantsMap ?? {},
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
    nextTaskDeadlineByProjectId,
    manualProjectPositions,
  )

  const isCards = (list.display_mode ?? 'list') === 'cards'
  const isCalendar = list.display_mode === 'calendar'
  const groupByField = (list.group_by ?? 'none') as GroupByField
  const listHeight = list.list_height ?? 'auto'

  const heightClass =
    listHeight === 'full' ? 'flex-1 min-h-0' :
    listHeight === 'medium' ? 'max-h-[600px]' :
    'max-h-[400px]'

  const groups = useMemo(
    () => groupTasks(filteredTasks, groupByField, assigneesMap, statuses),
    [filteredTasks, groupByField, assigneesMap, statuses],
  )

  // Project-статусы воркспейса нужны только для группировки списка проектов
  // по статусу. Запрашиваются всегда — кэш единый и переиспользуется
  // ProjectStatusFilter, BoardProjectRow и другими.
  const { data: projectStatuses = [] } = useAllProjectStatuses(isProject ? workspaceId : undefined)
  const projectGroups = useMemo(
    () => groupProjects(filteredProjects, groupByField, projectStatuses),
    [filteredProjects, groupByField, projectStatuses],
  )
  const hasGrouping = groupByField !== 'none'

  // DnD логика теперь живёт на уровне BoardView (этап 4.5). Здесь — только
  // визуал: какая группа/список «горячие» во время drag (из props
  // boardCardDnd, передаются вниз через BoardColumn).
  const activeGroupKey = boardCardDnd?.activeGroupKey ?? null
  const activeListCardsId = boardCardDnd?.activeListCardsId ?? null

  // Публикуем текущий видимый порядок карточек в registry BoardView —
  // нужен для ручного reorder (sort_by='manual_order'): BoardView в drag-end
  // читает оттуда, чтобы вычислить новый порядок и записать в БД.
  const registerListOrder = boardCardDnd?.registerListOrder
  const filteredTaskIds = useMemo(() => filteredTasks.map((t) => t.id), [filteredTasks])
  const filteredProjectIds = useMemo(() => filteredProjects.map((p) => p.id), [filteredProjects])
  useEffect(() => {
    if (!registerListOrder) return
    if (list.entity_type === 'thread') registerListOrder(list.id, 'thread', filteredTaskIds)
    else if (list.entity_type === 'project') registerListOrder(list.id, 'project', filteredProjectIds)
  }, [registerListOrder, list.id, list.entity_type, filteredTaskIds, filteredProjectIds])

  // Подсказка для drop-indicator конкретной карточки.
  const rowInd = boardCardDnd?.rowDropIndicator
  const indicatorForRow = useCallback(
    (kind: BoardItemType, itemId: string): 'top' | 'bottom' | null => {
      if (!rowInd) return null
      if (rowInd.listId !== list.id) return null
      if (rowInd.kind !== kind) return null
      if (rowInd.itemId !== itemId) return null
      return rowInd.position
    },
    [rowInd, list.id],
  )

  const count = isInbox ? 0 : isProject ? filteredProjects.length : filteredTasks.length
  // collapsed считается в основном компоненте, т.к. учитывает inboxThreads.length.

  return {
    // Local state
    userCollapsed,
    setUserCollapsed,
    settingsDialog,
    createDialog,
    calendarSlot,
    setCalendarSlot,
    // Derives
    isProject,
    isInbox,
    isCards,
    isCalendar,
    groupByField,
    listHeight,
    heightClass,
    hasGrouping,
    // Filters/data
    safeFilters,
    hasFilters,
    createPreset,
    // Mutations
    handleCreate,
    createPending,
    sortByDeadline,
    // Data maps
    nextTaskByProjectId,
    authorNameByUserId,
    peopleByRole,
    // Filtered
    filteredTasks,
    filteredProjects,
    count,
    // Groups
    groups,
    projectGroups,
    // DnD visuals
    activeGroupKey,
    activeListCardsId,
    indicatorForRow,
  }
}
