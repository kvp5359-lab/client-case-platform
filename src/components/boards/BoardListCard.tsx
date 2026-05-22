"use client"

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { useDialog } from '@/hooks/shared/useDialog'
import { useFilteredTasks, useFilteredProjects } from './hooks/useFilteredListData'
import { useWorkspaceProjectParticipants } from './hooks/useWorkspaceProjectParticipants'
import { DraggableBoardTaskRow } from './DraggableBoardTaskRow'
import { DraggableBoardProjectRow } from './DraggableBoardProjectRow'
import { BoardInboxList } from './BoardInboxList'
import { BoardListHeader } from './BoardListHeader'
import { BoardListCalendarView } from './BoardListCalendarView'
import { ListSettingsDialog } from './ListSettingsDialog'
import { useCreateTaskHandler } from '@/components/tasks/useCreateTaskMutation'
import { useQueueThreadInitialMessage } from '@/components/tasks/useQueueThreadInitialMessage'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { newThreadToTaskItem } from '@/components/tasks/taskListConstants'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import { extractThreadCreatePreset } from '@/lib/filters/extractPreset'
import type { BoardGlobalFilter, BoardList, GroupByField } from './types'
import type { FilterContext } from '@/lib/filters/types'
import { mergeFilterGroupsAnd } from '@/lib/filters/types'

// Lazy: ChatSettingsDialog тянет Tiptap (~200 KB) через ComposeField.
const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)
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
import type { BoardItemType, BoardListOrdersMap } from './hooks/useBoardListItemOrders'

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
  /** Удалить задачу (мягко в корзину) — для поля `menu` в карточке. */
  onDeleteTask?: (task: WorkspaceTask) => void
  /** Сменить дедлайн задачи — для поля `menu`. */
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
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
  /** Подсветка позиции для ручной сортировки — над какой карточкой и где. */
  rowDropIndicator: {
    kind: BoardItemType
    listId: string
    itemId: string
    position: 'top' | 'bottom'
  } | null
  /** Ручной порядок (board_list_item_order) по всем спискам доски. */
  manualOrders: BoardListOrdersMap
  /** Регистрация текущего видимого порядка карточек — BoardView читает его на drag-end. */
  registerListOrder: (listId: string, itemType: BoardItemType, ids: string[]) => void
  /** Только что отпущенная карточка — для краткой подсветки места приземления.
   *  Формат `thread:<uuid>` или `project:<uuid>`. */
  recentlyDroppedId: string | null
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
  fullHeight,
  children,
}: {
  listId: string
  isActive: boolean
  /** Когда у списка list_height='full' — растягиваемся как flex-item, чтобы
   *  inner-контейнер с overflow-y-auto получил конечную высоту и реально
   *  скроллился. Для 'auto'/'medium' inner сам ограничен max-h, flex не нужен. */
  fullHeight?: boolean
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
        fullHeight && 'flex flex-col flex-1 min-h-0',
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
  onDeleteTask,
  onDeadlineChange,
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
    manualProjectPositions,
  )

  const count = isInbox ? inboxThreads.length : isProject ? filteredProjects.length : filteredTasks.length
  const collapsed = userCollapsed ?? (!isInbox && count === 0)

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
  const indicatorForRow = (kind: BoardItemType, itemId: string): 'top' | 'bottom' | null => {
    if (!rowInd) return null
    if (rowInd.listId !== list.id) return null
    if (rowInd.kind !== kind) return null
    if (rowInd.itemId !== itemId) return null
    return rowInd.position
  }

  return (
    <div className={cn('rounded-lg', listHeight === 'full' && 'flex flex-col flex-1 min-h-0')}>
      <BoardListHeader
        list={list}
        count={count}
        collapsed={collapsed}
        onToggleCollapse={() => setUserCollapsed(!collapsed)}
        onOpenSettings={settingsDialog.open}
        onCreateThread={list.entity_type === 'thread' ? createDialog.open : undefined}
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
        fullHeight={listHeight === 'full'}
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
                      <SortableContext
                        items={group.projects.map((p) => `project:${p.id}:${list.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
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
                              dropIndicator={indicatorForRow('project', project.id)}
                              justDropped={boardCardDnd?.recentlyDroppedId === `project:${project.id}`}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </BoardGroupDropZone>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {hasFilters ? 'Нет элементов по фильтру' : 'Пусто'}
                </div>
              )
            ) : isCalendar ? (
              <BoardListCalendarView
                listId={list.id}
                workspaceId={workspaceId}
                tasks={filteredTasks}
                onOpenTask={(task) => onOpenTask(task.id)}
                settings={list.calendar_settings}
                listHeight={listHeight}
                onCreateAtSlot={(start, end) => {
                  setCalendarSlot({ start: start.toISOString(), end: end.toISOString() })
                  createDialog.open()
                }}
              />
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
                      <SortableContext
                        items={group.tasks.map((t) => `task:${t.id}:${list.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
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
                              onDeleteTask={onDeleteTask}
                              onDeadlineChange={onDeadlineChange}
                              isSelected={selectedThreadId === task.id}
                              cardLayout={list.card_layout}
                              dropIndicator={indicatorForRow('thread', task.id)}
                              justDropped={boardCardDnd?.recentlyDroppedId === `thread:${task.id}`}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </BoardGroupDropZone>
                  ))}
                </div>
              ) : (
                <SortableContext
                  items={filteredTasks.map((t) => `task:${t.id}:${list.id}`)}
                  strategy={verticalListSortingStrategy}
                >
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
                        onDeleteTask={onDeleteTask}
                        onDeadlineChange={onDeadlineChange}
                        isSelected={selectedThreadId === task.id}
                        cardLayout={list.card_layout}
                        dropIndicator={indicatorForRow('thread', task.id)}
                        justDropped={boardCardDnd?.recentlyDroppedId === `thread:${task.id}`}
                      />
                    ))}
                  </div>
                </SortableContext>
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

      {createDialog.isOpen && list.entity_type === 'thread' && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={null}
            workspaceId={workspaceId}
            projectId={createPreset?.projectId}
            defaultTabMode={createPreset?.tabMode ?? 'task'}
            initialValues={
              calendarSlot
                ? { ...(createPreset ?? {}), startAt: calendarSlot.start, endAt: calendarSlot.end }
                : createPreset
            }
            open={createDialog.isOpen}
            onOpenChange={(v) => {
              if (v) createDialog.open()
              else {
                createDialog.close()
                setCalendarSlot(null)
              }
            }}
            onCreate={handleCreate}
            isPending={createPending}
          />
        </Suspense>
      )}
    </div>
  )
}

