"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { BoardColumn } from './BoardColumn'
import { ColumnGap, DroppableColumn } from './BoardViewDropTargets'
import { BoardDragOverlayContent } from './board-view/BoardDragOverlayContent'
import { makeBoardCollisionDetection } from './board-view/collisionDetection'
import {
  planManualReorder,
  planListCardsDrop,
  planGroupDrop,
  type CardDrag,
} from './board-view/cardDragHandlers'
import { planGapDrop, planListMove } from './board-view/listDragHandlers'
import { analyzeDragOver } from './board-view/dragOverAnalysis'
import type { BoardCardDndState } from './types'
import { usePanDrag } from './hooks/usePanDrag'
import { useReorderLists } from './hooks/useListMutations'
import { useUpdateProjectStatusOnBoard } from './hooks/useUpdateProjectStatusOnBoard'
import {
  useBoardListItemOrders,
  useReorderBoardListItems,
  type BoardItemType,
} from './hooks/useBoardListItemOrders'
import {
  DEFAULT_COLUMN_WIDTH,
  EMPTY_BOARD_GLOBAL_FILTER,
  type BoardGlobalFilter,
  type BoardList,
} from './types'
import type { FilterContext } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

type BoardViewProps = {
  boardId: string
  lists: BoardList[]
  tasks: WorkspaceTask[]
  projects: BoardProject[]
  inboxThreads: InboxThreadEntry[]
  assigneesMap: Record<string, AvatarParticipant[]>
  workspaceId: string
  currentParticipantId: string | null
  currentUserId: string | null
  userToParticipantMap?: Record<string, string>
  statuses?: StatusOption[]
  /** Массив ширин колонок в px по индексу (из board.column_widths) */
  columnWidths?: number[]
  /** Фильтр на уровне всей доски (этап 4.1). Применяется AND к фильтру каждого
   *  списка соответствующего entity_type. Если не передан — пустой (no-op). */
  boardGlobalFilter?: BoardGlobalFilter
  onOpenTask?: (taskId: string) => void
  onOpenThread?: (task: TaskItem) => void
  onStatusChange?: (taskId: string, statusId: string | null) => void
  /** Удалить задачу — для поля `menu` в карточке. */
  onDeleteTask?: (task: WorkspaceTask) => void
  /** Сменить дедлайн — для поля `menu` в карточке. */
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
  selectedThreadId?: string | null
  /** id проекта, открытого в боковой панели — соответствующая строка подсвечивается. */
  selectedProjectId?: string | null
}

export function BoardView({
  boardId,
  lists,
  tasks,
  projects,
  inboxThreads,
  assigneesMap,
  workspaceId,
  currentParticipantId,
  currentUserId,
  userToParticipantMap,
  statuses,
  columnWidths,
  boardGlobalFilter,
  onOpenTask,
  onOpenThread,
  onStatusChange,
  onDeleteTask,
  onDeadlineChange,
  selectedThreadId,
  selectedProjectId,
}: BoardViewProps) {
  const effectiveBoardFilter = boardGlobalFilter ?? EMPTY_BOARD_GLOBAL_FILTER
  const reorderLists = useReorderLists()
  const reorderItems = useReorderBoardListItems()

  const listIds = useMemo(() => lists.map((l) => l.id), [lists])
  const { data: itemOrders } = useBoardListItemOrders(boardId, listIds)

  // Регистр текущего отрисованного порядка карточек по каждому списку.
  // BoardListCard в useEffect публикует сюда свой filteredTasks/filteredProjects.
  // На drag-end читаем из ref, чтобы пересобрать новый порядок.
  const orderRegistryRef = useRef<
    Record<string, { thread: string[]; project: string[] }>
  >({})
  const registerListOrder = useCallback(
    (listId: string, itemType: BoardItemType, ids: string[]) => {
      const slot = orderRegistryRef.current[listId] ?? { thread: [], project: [] }
      orderRegistryRef.current[listId] = { ...slot, [itemType]: ids }
    },
    [],
  )

  const columns = useMemo(() => {
    const map = new Map<number, BoardList[]>()
    for (const list of lists) {
      const col = list.column_index
      if (!map.has(col)) map.set(col, [])
      map.get(col)!.push(list)
    }
    for (const col of map.values()) {
      col.sort((a, b) => a.sort_order - b.sort_order)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, columnLists]) => ({ index, lists: columnLists }))
  }, [lists])

  const filterCtx: FilterContext = useMemo(
    () => ({
      currentParticipantId,
      currentUserId,
      now: new Date(),
      userToParticipantMap,
    }),
    [currentParticipantId, currentUserId, userToParticipantMap],
  )

  const panRef = usePanDrag<HTMLDivElement>()

  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ overListId: string; position: 'top' | 'bottom' } | null>(null)
  const [overColumnIndex, setOverColumnIndex] = useState<number | null>(null)
  const [gapTarget, setGapTarget] = useState<number | null>(null)

  // Этап 4.5: card DnD состояние. Лежит здесь чтобы один контекст обслуживал
  // все списки сразу (cross-list drag).
  const [activeCard, setActiveCard] = useState<CardDrag | null>(null)
  const [overCardTarget, setOverCardTarget] = useState<string | null>(null)
  // Курсор над календарным списком — прячем DragOverlay, чтобы не
  // дублировать призрак, который рисует сам календарь.
  const [isOverCalendar, setIsOverCalendar] = useState(false)
  // Подсветка позиции для ручной сортировки (drop на конкретную карточку).
  const [rowDropIndicator, setRowDropIndicator] = useState<
    | { kind: BoardItemType; listId: string; itemId: string; position: 'top' | 'bottom' }
    | null
  >(null)
  // ID карточки, только что отпущенной — для краткой подсветки «приземления».
  // Формат: `thread:<uuid>` или `project:<uuid>` (без listId — карточка могла
  // переехать в другой список при смене статуса).
  const [recentlyDroppedId, setRecentlyDroppedId] = useState<string | null>(null)
  const recentlyDroppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashDrop = useCallback((kind: 'thread' | 'project', id: string) => {
    if (recentlyDroppedTimerRef.current) clearTimeout(recentlyDroppedTimerRef.current)
    setRecentlyDroppedId(`${kind}:${id}`)
    recentlyDroppedTimerRef.current = setTimeout(() => setRecentlyDroppedId(null), 700)
  }, [])
  useEffect(() => () => {
    if (recentlyDroppedTimerRef.current) clearTimeout(recentlyDroppedTimerRef.current)
  }, [])
  // TEMP DEBUG — показываем в углу что видит dnd-kit. Удалить когда manual-reorder заработает.

  const updateProjectStatus = useUpdateProjectStatusOnBoard()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const activeList = activeListId ? lists.find((l) => l.id === activeListId) ?? null : null

  // Анимация «приземления»: overlay плавно встаёт на финальную позицию карточки.
  // Для drag списков — не нужна (там нет overlay-движения), оставляем null.
  const cardDropAnimation: DropAnimation = useMemo(
    () => ({
      duration: 220,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      sideEffects: defaultDropAnimationSideEffects({
        styles: { active: { opacity: '0.4' } },
      }),
    }),
    [],
  )

  // Снимок состояния card-DnD, передаём вниз через BoardColumn → BoardListCard
  // для подсветки активной группы/списка.
  const cardDndState: BoardCardDndState = useMemo(
    () => ({
      activeGroupKey: overCardTarget && overCardTarget.startsWith('group:') ? overCardTarget : null,
      activeListCardsId:
        overCardTarget && overCardTarget.startsWith('list-cards:') ? overCardTarget : null,
      rowDropIndicator,
      manualOrders: itemOrders ?? {},
      registerListOrder,
      recentlyDroppedId,
    }),
    [overCardTarget, rowDropIndicator, itemOrders, registerListOrder, recentlyDroppedId],
  )

  // Кастомный collision detection — pure-функция, вынесена в ./board-view/collisionDetection.
  const collisionDetection: CollisionDetection = useMemo(
    () => makeBoardCollisionDetection(lists),
    [lists],
  )

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id)
    if (id.startsWith('list-drag:')) {
      setActiveListId(id.slice('list-drag:'.length))
      return
    }
    // Карточки (этап 4.5) — id вида `task:<id>:<listId>` или `project:<id>:<listId>`.
    const data = e.active.data.current as
      | { kind?: 'task'; task?: WorkspaceTask; sourceListId?: string }
      | { kind?: 'project'; project?: BoardProject; sourceListId?: string }
      | undefined
    if (data?.kind === 'task' && data.task && data.sourceListId) {
      setActiveCard({ kind: 'task', task: data.task, sourceListId: data.sourceListId })
    } else if (data?.kind === 'project' && data.project && data.sourceListId) {
      setActiveCard({ kind: 'project', project: data.project, sourceListId: data.sourceListId })
    }
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    const result = analyzeDragOver(e, activeCard)
    if (result.type === 'card') {
      setIsOverCalendar(result.isOverCalendar)
      setRowDropIndicator(result.rowDropIndicator)
      setOverCardTarget(result.overCardTarget)
    } else {
      setDropIndicator(result.dropIndicator)
      setOverColumnIndex(result.overColumnIndex)
      setGapTarget(result.gapTarget)
    }
  }, [activeCard])

  const handleDragCancel = useCallback(() => {
    setActiveListId(null)
    setDropIndicator(null)
    setOverColumnIndex(null)
    setGapTarget(null)
    setActiveCard(null)
    setOverCardTarget(null)
    setRowDropIndicator(null)
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const activeId = String(e.active.id)

    // ── Card drag (этап 4.5) ────────────────────────────────────────
    if (activeId.startsWith('task:') || activeId.startsWith('project:')) {
      const card = activeCard
      const target = overCardTarget
      const rowInd = rowDropIndicator
      setActiveCard(null)
      setOverCardTarget(null)
      setRowDropIndicator(null)
      setIsOverCalendar(false)
      if (!card) return

      // Drop задачи в календарный список обрабатывается ВНУТРИ
      // BoardListCalendarView через useDndMonitor.
      const overId = e.over ? String(e.over.id) : null
      if (overId && overId.startsWith('calendar-drop:')) return

      // Pure-планировщики возвращают action, который применяем здесь.
      let action: ReturnType<typeof planManualReorder> = { type: 'noop' }
      if (rowInd) {
        const itemType: BoardItemType = card.kind === 'project' ? 'project' : 'thread'
        const currentIds = orderRegistryRef.current[rowInd.listId]?.[itemType] ?? []
        action = planManualReorder({ card, rowInd, lists, currentIds })
      } else if (target?.startsWith('list-cards:')) {
        action = planListCardsDrop(card, target.slice('list-cards:'.length), lists)
      } else if (target?.startsWith('group:')) {
        action = planGroupDrop(card, target)
      }

      switch (action.type) {
        case 'reorder':
          reorderItems.mutate({
            board_id: boardId,
            list_id: action.listId,
            item_type: action.itemType,
            item_ids: action.itemIds,
          })
          flashDrop(action.flashKind, action.flashId)
          return
        case 'change_project_status':
          updateProjectStatus.mutate({ projectId: action.projectId, statusId: action.statusId })
          flashDrop('project', action.projectId)
          return
        case 'change_task_status':
          onStatusChange?.(action.taskId, action.statusId)
          flashDrop('thread', action.taskId)
          return
        case 'noop':
          return
      }
    }

    // ── List drag ───────────────────────────────────────────────────
    const ind = dropIndicator
    const gap = gapTarget
    const dragged = activeList
    setActiveListId(null)
    setDropIndicator(null)
    setOverColumnIndex(null)
    setGapTarget(null)
    if (!dragged || !e.over) return

    const overId = String(e.over.id)
    const updates =
      gap !== null
        ? planGapDrop(dragged, lists, gap)
        : planListMove({ dragged, lists, dropIndicator: ind, overId })

    if (updates.length === 0) return
    reorderLists.mutate({ board_id: dragged.board_id, updates })
  }, [activeList, dropIndicator, gapTarget, lists, reorderLists, activeCard, overCardTarget, rowDropIndicator, updateProjectStatus, onStatusChange, reorderItems, boardId, flashDrop])

  if (lists.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Добавьте первый список, чтобы начать
      </div>
    )
  }

  const isDragging = activeListId !== null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div ref={panRef} className="flex p-4 h-full min-w-min cursor-grab">
        <ColumnGap gapIndex={0} active={gapTarget === 0} visible={isDragging} isFirst />
        {columns.map((col, idx) => (
          <div key={col.index} className="flex shrink-0 h-full">
            <DroppableColumn
              columnIndex={col.index}
              width={columnWidths?.[idx] ?? DEFAULT_COLUMN_WIDTH}
              isActiveTarget={overColumnIndex === col.index && !dropIndicator && gapTarget === null}
            >
              <BoardColumn
                lists={col.lists}
                tasks={tasks}
                projects={projects}
                inboxThreads={inboxThreads}
                assigneesMap={assigneesMap}
                filterCtx={filterCtx}
                workspaceId={workspaceId}
                statuses={statuses ?? []}
                width={columnWidths?.[idx] ?? DEFAULT_COLUMN_WIDTH}
                boardGlobalFilter={effectiveBoardFilter}
                boardCardDnd={cardDndState}
                onOpenTask={onOpenTask ?? (() => {})}
                onOpenThread={onOpenThread ?? (() => {})}
                onStatusChange={onStatusChange ?? (() => {})}
                onDeleteTask={onDeleteTask}
                onDeadlineChange={onDeadlineChange}
                selectedThreadId={selectedThreadId}
                selectedProjectId={selectedProjectId}
                existingColumns={columns.length}
                activeDragListId={activeListId}
                dropIndicator={dropIndicator}
              />
            </DroppableColumn>
            <ColumnGap gapIndex={col.index + 1} active={gapTarget === col.index + 1} visible={isDragging} />
          </div>
        ))}
        {/* Распорка: при открытой боковой панели (45% ширины) контент можно доскроллить */}
        <div className="shrink-0 w-[45vw]" aria-hidden />
      </div>
      <DragOverlay dropAnimation={activeList ? null : cardDropAnimation}>
        <BoardDragOverlayContent
          isOverCalendar={isOverCalendar}
          activeList={activeList}
          activeCard={activeCard}
          lists={lists}
          workspaceId={workspaceId}
          assigneesMap={assigneesMap}
          statuses={statuses ?? []}
        />
      </DragOverlay>
    </DndContext>
  )
}
