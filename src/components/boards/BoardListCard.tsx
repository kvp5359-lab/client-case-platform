"use client"

import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { useDialog } from '@/hooks/shared/useDialog'
import { useFilteredTasks, useFilteredProjects } from './hooks/useFilteredListData'
import { useWorkspaceProjectParticipants } from './hooks/useWorkspaceProjectParticipants'
import { DraggableBoardTaskRow } from './DraggableBoardTaskRow'
import { DraggableBoardProjectRow } from './DraggableBoardProjectRow'
import { BoardInboxList } from './BoardInboxList'
import { BoardListHeader } from './BoardListHeader'
import { ListSettingsDialog } from './ListSettingsDialog'
import type { BoardGlobalFilter, BoardList, FilterContext, GroupByField } from './types'
import { mergeFilterGroupsAnd } from './types'
import { groupTasks, groupProjects } from './boardListUtils'
import { useAllProjectStatuses } from '@/hooks/useStatuses'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

interface BoardListCardProps {
  list: BoardList
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  inboxThreads: InboxThreadEntry[]
  assigneesMap: Record<string, AvatarParticipant[]>
  filterCtx: FilterContext
  workspaceId: string
  statuses: StatusOption[]
  onOpenTask: (taskId: string) => void
  onOpenThread: (task: TaskItem) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  selectedThreadId?: string | null
  selectedProjectId?: string | null
  existingColumns?: number
  isFirst?: boolean
  isLast?: boolean
  siblingLists?: BoardList[]
  columnWidth?: number
  /** Фильтр всей доски (этап 4.1). Применяется AND к list.filters
   *  для соответствующего entity_type. Inbox-списки игнорируют. */
  boardGlobalFilter?: BoardGlobalFilter
  /** Состояние card-DnD из BoardView (этап 4.5) — для подсветки группы/списка
   *  во время drag. Сама DnD-логика обрабатывается на уровне BoardView. */
  boardCardDnd?: BoardCardDndState
}

/** Снимок состояния card-DnD, который BoardView пробрасывает в каждый список. */
export interface BoardCardDndState {
  /** Полный ID активной droppable-группы вида `group:<list_id>:<key>` или null. */
  activeGroupKey: string | null
  /** Полный ID активного droppable-списка вида `list-cards:<list_id>` или null. */
  activeListCardsId: string | null
}

/**
 * Droppable-обёртка вокруг группы (статуса) на доске. id вида
 * `group:<list_id>:<status_id>` (с listId-namespace, чтобы у разных списков
 * группы с одинаковым status_id не конфликтовали — это критично после
 * лифтинга DnD на уровень BoardView в этапе 4.5).
 *
 * Объявляется ДО BoardListCard — webpack-bundler не всегда корректно
 * хойстит function-declaration в eval()-режиме HMR.
 */
function BoardGroupDropZone({
  listId,
  groupKey,
  isActive,
  children,
}: {
  listId: string
  groupKey: string
  isActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${listId}:${groupKey}` })
  const hot = isOver || isActive
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg transition-colors',
        hot && 'bg-blue-100/40 ring-1 ring-blue-300',
      )}
    >
      {children}
    </div>
  )
}

/**
 * Droppable-обёртка вокруг тела всего списка (этап 4.5). При drop карточки
 * сюда — статус карточки меняется на тот, что прописан в фильтре списка
 * (см. extractStatusIdFromFilter в cardDndUtils). Если фильтр не содержит
 * status_id — drop игнорируется в BoardView.
 *
 * id: `list-cards:<list_id>`.
 */
function BoardListCardsDropZone({
  listId,
  isActive,
  children,
}: {
  listId: string
  isActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list-cards:${listId}` })
  const hot = isOver || isActive
  // min-h обязателен: иначе у пустого списка droppable-зона имеет нулевую
  // высоту и pointerWithin никогда не срабатывает — карточки не дотащить
  // до пустой колонки воронки.
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg min-h-[60px] transition-colors',
        hot && 'bg-blue-100/40 ring-2 ring-blue-400',
      )}
    >
      {children}
    </div>
  )
}

export function BoardListCard({
  list,
  tasks,
  projects,
  inboxThreads,
  assigneesMap,
  filterCtx,
  workspaceId,
  statuses,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  selectedThreadId,
  selectedProjectId,
  existingColumns,
  isFirst,
  isLast,
  siblingLists,
  columnWidth,
  boardGlobalFilter,
  boardCardDnd,
}: BoardListCardProps) {
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null)
  const settingsDialog = useDialog()

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
        : list.entity_type === 'task'
        ? boardGlobalFilter.task
        : null
    if (!boardSlice) return listFilters
    return mergeFilterGroupsAnd(boardSlice, listFilters)
  }, [isInbox, boardGlobalFilter, list.filters, list.entity_type])

  const hasFilters = safeFilters.rules.length > 0

  // Для списков проектов вычисляем карту «ближайшая незавершённая задача» по project_id.
  // Используем уже загруженный кэш `tasks` (useWorkspaceThreads) — дополнительных запросов нет.
  // Загружаем is_final из taskStatuses только если это project-list, чтобы не дёргать в task-списках.
  const { data: fullStatuses = [] } = useTaskStatuses(isProject ? workspaceId : undefined)
  const nextTaskByProjectId = useMemo(() => {
    if (!isProject) return {}
    const finalStatusIds = new Set(fullStatuses.filter((s) => s.is_final).map((s) => s.id))
    const byProject: Record<string, WorkspaceTask> = {}
    for (const t of tasks) {
      if (t.type !== 'task') continue
      if (!t.project_id || !t.deadline) continue
      if (t.status_id && finalStatusIds.has(t.status_id)) continue
      const existing = byProject[t.project_id]
      if (!existing || new Date(t.deadline).getTime() < new Date(existing.deadline!).getTime()) {
        byProject[t.project_id] = t
      }
    }
    return byProject
  }, [isProject, tasks, fullStatuses])

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

  const filteredTasks = useFilteredTasks(
    list.entity_type === 'task' ? tasks : [],
    safeFilters,
    filterCtx,
    simpleAssigneesMap,
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
  )

  const { data: projectParticipantsMap } = useWorkspaceProjectParticipants(
    workspaceId,
    isProject,
  )

  const filteredProjects = useFilteredProjects(
    isProject ? projects : [],
    safeFilters,
    filterCtx,
    projectParticipantsMap ?? {},
    list.sort_by ?? 'created_at',
    list.sort_dir ?? 'desc',
    nextTaskDeadlineByProjectId,
  )

  const count = isInbox ? inboxThreads.length : isProject ? filteredProjects.length : filteredTasks.length
  const collapsed = userCollapsed ?? (!isInbox && count === 0)

  const isCards = (list.display_mode ?? 'list') === 'cards'
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

  return (
    <div className={cn('rounded-lg', listHeight === 'full' && 'flex flex-col flex-1 min-h-0')}>
      <BoardListHeader
        list={list}
        count={count}
        collapsed={collapsed}
        onToggleCollapse={() => setUserCollapsed(!collapsed)}
        onOpenSettings={settingsDialog.open}
        hasFilters={hasFilters}
        isInbox={isInbox}
        isFirst={isFirst}
        isLast={isLast}
        siblingLists={siblingLists}
      />

      {/* BoardListCardsDropZone должен рендериться ВСЕГДА (даже у свёрнутых
          списков — иначе пустая колонка воронки не сможет быть drop-target,
          т.к. она автосворачивается при count=0). Содержимое внутри
          скрывается отдельно через {!collapsed}. */}
      <BoardListCardsDropZone
        listId={list.id}
        isActive={activeListCardsId === `list-cards:${list.id}`}
      >
        {!collapsed && (
          <div className={cn(heightClass, 'mt-1 overflow-y-auto scrollbar-hide', !isCards && !hasGrouping && 'rounded-lg border border-border/50 bg-white')}>
            {isInbox ? (
              <BoardInboxList
                threads={inboxThreads}
                onOpenThread={onOpenThread}
                selectedThreadId={selectedThreadId}
                defaultFilter={(list.filters as unknown as { default_filter?: string })?.default_filter === 'unread' ? 'unread' : 'all'}
                workspaceId={workspaceId}
              />
            ) : isProject ? (
              filteredProjects.length > 0 ? (
                <div className={cn(isCards ? 'grid gap-1' : hasGrouping ? 'flex flex-col gap-2' : 'divide-y divide-border/50')}>
                  {projectGroups.map((group) => (
                    <BoardGroupDropZone
                      key={group.key}
                      listId={list.id}
                      groupKey={group.key}
                      isActive={activeGroupKey === `group:${list.id}:${group.key}`}
                    >
                      {hasGrouping && (
                        <div className={cn('px-0 pb-1')}>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                              !group.color && 'bg-muted-foreground/10 text-muted-foreground',
                            )}
                            style={
                              group.color
                                ? {
                                    backgroundColor: `${group.color}1A`,
                                    color: group.color,
                                  }
                                : undefined
                            }
                          >
                            {group.label}
                            <span className="opacity-50">{group.projects.length}</span>
                          </span>
                        </div>
                      )}
                      <div className={cn(
                        isCards
                          ? 'grid grid-cols-1 gap-1'
                          : hasGrouping
                            ? 'divide-y divide-border/50 rounded-lg border border-border/50 bg-white overflow-hidden'
                            : 'divide-y divide-border/50'
                      )}>
                        {group.projects.map((project) => (
                          <DraggableBoardProjectRow
                            key={project.id}
                            listId={list.id}
                            project={project}
                            workspaceId={workspaceId}
                            displayMode={list.display_mode ?? 'list'}
                            visibleFields={list.visible_fields ?? ['status', 'template']}
                            isSelected={selectedProjectId === project.id}
                            cardLayout={list.card_layout}
                            nextTask={nextTaskByProjectId[project.id]}
                            authorName={project.created_by ? authorNameByUserId[project.created_by] : null}
                          />
                        ))}
                      </div>
                    </BoardGroupDropZone>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
                </div>
              )
            ) : filteredTasks.length > 0 ? (
              hasGrouping ? (
                <div className={cn(isCards ? 'grid gap-1' : 'flex flex-col gap-2')}>
                  {groups.map((group) => (
                    <BoardGroupDropZone
                      key={group.key}
                      listId={list.id}
                      groupKey={group.key}
                      isActive={activeGroupKey === `group:${list.id}:${group.key}`}
                    >
                      <div className={cn('px-2 pb-1', isCards && 'px-0 pb-1')}>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted-foreground/10 text-[11px] font-medium text-muted-foreground">
                          {group.label}
                          <span className="opacity-50">{group.tasks.length}</span>
                        </span>
                      </div>
                      <div className={cn(
                        isCards
                          ? 'grid grid-cols-1 gap-1'
                          : 'divide-y divide-border/50 rounded-lg border border-border/50 bg-white overflow-hidden'
                      )}>
                        {group.tasks.map((task) => (
                          <DraggableBoardTaskRow
                            key={task.id}
                            listId={list.id}
                            task={task}
                            workspaceId={workspaceId}
                            assignees={assigneesMap[task.id] ?? []}
                            statuses={statuses}
                            visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                            displayMode={list.display_mode ?? 'list'}
                            onOpenTask={onOpenTask}
                            onStatusChange={onStatusChange}
                            isSelected={selectedThreadId === task.id}
                            cardLayout={list.card_layout}
                            dropIndicator={null}
                          />
                        ))}
                      </div>
                    </BoardGroupDropZone>
                  ))}
                </div>
              ) : (
                <div className={cn(isCards ? 'grid grid-cols-1 gap-1' : 'divide-y divide-border/50')}>
                  {filteredTasks.map((task) => (
                    <DraggableBoardTaskRow
                      key={task.id}
                      listId={list.id}
                      task={task}
                      workspaceId={workspaceId}
                      assignees={assigneesMap[task.id] ?? []}
                      statuses={statuses}
                      visibleFields={list.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                      displayMode={list.display_mode ?? 'list'}
                      onOpenTask={onOpenTask}
                      onStatusChange={onStatusChange}
                      isSelected={selectedThreadId === task.id}
                      cardLayout={list.card_layout}
                      dropIndicator={null}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
              </div>
            )}
          </div>
        )}
      </BoardListCardsDropZone>

      <ListSettingsDialog
        open={settingsDialog.isOpen}
        onClose={settingsDialog.close}
        list={list}
        workspaceId={workspaceId}
        existingColumns={existingColumns}
        columnWidth={columnWidth}
      />
    </div>
  )
}

