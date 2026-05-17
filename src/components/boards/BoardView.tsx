"use client"

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  rectIntersection,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { BoardColumn } from './BoardColumn'
import { ColumnGap, DroppableColumn } from './BoardViewDropTargets'
import { BoardProjectRow } from './BoardProjectRow'
import { BoardTaskRow } from './BoardTaskRow'
import type { BoardCardDndState } from './BoardListCard'
import { usePanDrag } from './hooks/usePanDrag'
import { useReorderLists } from './hooks/useListMutations'
import { useUpdateProjectStatusOnBoard } from './hooks/useUpdateProjectStatusOnBoard'
import {
  useBoardListItemOrders,
  useReorderBoardListItems,
  type BoardItemType,
} from './hooks/useBoardListItemOrders'
import { extractStatusIdFromFilter, statusEquals } from './cardDndUtils'
import {
  DEFAULT_COLUMN_WIDTH,
  EMPTY_BOARD_GLOBAL_FILTER,
  type BoardGlobalFilter,
  type BoardList,
} from './types'
import type { FilterContext } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'
import { hexToHeaderStyle } from './types'

interface BoardViewProps {
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
  const [activeCard, setActiveCard] = useState<
    | { kind: 'project'; project: BoardProject; sourceListId: string }
    | { kind: 'task'; task: WorkspaceTask; sourceListId: string }
    | null
  >(null)
  const [overCardTarget, setOverCardTarget] = useState<string | null>(null)
  // Курсор над календарным списком — прячем DragOverlay, чтобы не
  // дублировать призрак, который рисует сам календарь.
  const [isOverCalendar, setIsOverCalendar] = useState(false)
  // Подсветка позиции для ручной сортировки (drop на конкретную карточку).
  const [rowDropIndicator, setRowDropIndicator] = useState<
    | { kind: BoardItemType; listId: string; itemId: string; position: 'top' | 'bottom' }
    | null
  >(null)
  // TEMP DEBUG — показываем в углу что видит dnd-kit. Удалить когда manual-reorder заработает.
  const [debugInfo, setDebugInfo] = useState<string>('')

  const updateProjectStatus = useUpdateProjectStatusOnBoard()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const activeList = activeListId ? lists.find((l) => l.id === activeListId) ?? null : null

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
    }),
    [overCardTarget, rowDropIndicator, itemOrders, registerListOrder],
  )

  // Кастомный collision detection. При drag списка приоритезируем
  // gap-drop → list-drop → col-drop. При drag карточки (этап 4.5) —
  // совершенно другая иерархия: group → list-cards (то есть никаких
  // gap/col-drop, чтобы синяя полоска между списками не воровала фокус).
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeId = args.active ? String(args.active.id) : ''
    const isCardDrag = activeId.startsWith('task:') || activeId.startsWith('project:')

    if (isCardDrag) {
      // ВАЖНО: для карточек DragOverlay прячет реальный элемент за курсором,
      // и rectIntersection ловит исходную позицию. Используем pointerWithin —
      // он работает по координате курсора.
      const collisions = pointerWithin(args)
      // Приоритет 1: drop на конкретную карточку (ручной reorder) — только если
      // карточка в списке с sort_by='manual_order'. Иначе игнорируем.
      const row = collisions.find((c) => {
        const id = String(c.id)
        if (!id.startsWith('task-row:') && !id.startsWith('project-row:')) return false
        const parts = id.split(':')
        const listId = parts[2]
        const list = lists.find((l) => l.id === listId)
        return list?.sort_by === 'manual_order'
      })
      if (row) return [row]

      // Указатель в list-cards/group любого manual_order-списка (между
      // карточками, над/под ними) — ищем ближайшую task-row/project-row того
      // же списка по Y, чтобы синяя полоска появлялась всегда, а не только
      // точно над карточкой.
      const rowPrefix = activeId.startsWith('task:') ? 'task-row:' : 'project-row:'
      if (args.pointerCoordinates) {
        // Список, чья list-cards/group зона под курсором сейчас.
        let targetListId: string | null = null
        for (const c of collisions) {
          const id = String(c.id)
          if (id.startsWith('list-cards:')) {
            targetListId = id.slice('list-cards:'.length)
            break
          }
          if (id.startsWith('group:')) {
            const rest = id.slice('group:'.length)
            const sep = rest.indexOf(':')
            if (sep !== -1) {
              targetListId = rest.slice(0, sep)
              break
            }
          }
        }
        const targetList = targetListId ? lists.find((l) => l.id === targetListId) : null
        if (targetList?.sort_by === 'manual_order') {
          const pointerY = args.pointerCoordinates.y
          let nearestId: string | null = null
          let nearestDist = Infinity
          for (const d of args.droppableContainers) {
            const id = String(d.id)
            if (!id.startsWith(rowPrefix)) continue
            if (!id.endsWith(`:${targetListId}`)) continue
            const r = d.rect.current
            if (!r) continue
            const cy = r.top + r.height / 2
            const dist = Math.abs(cy - pointerY)
            if (dist < nearestDist) {
              nearestDist = dist
              nearestId = id
            }
          }
          if (nearestId) {
            const found = args.droppableContainers.find((d) => String(d.id) === nearestId)
            if (found) return [{ id: found.id, data: found.data }]
          }
        }
      }

      // Календарный drop-таргет — приоритет выше list-cards, потому что
      // календарь вложен в list-cards и pointerWithin вернёт оба.
      const calendar = collisions.find((c) => String(c.id).startsWith('calendar-drop:'))
      if (calendar) return [calendar]
      const group = collisions.find((c) => String(c.id).startsWith('group:'))
      if (group) return [group]
      const listCards = collisions.find((c) => String(c.id).startsWith('list-cards:'))
      if (listCards) return [listCards]
      return collisions.filter((c) => {
        const id = String(c.id)
        return !id.startsWith('gap-drop:') && !id.startsWith('list-drop:') && !id.startsWith('col-drop:')
      })
    }

    // List drag — существующая логика на rectIntersection (списки не используют overlay).
    const intersections = rectIntersection(args)
    const gap = intersections.find((c) => String(c.id).startsWith('gap-drop:'))
    if (gap) return [gap]
    const list = intersections.find((c) => String(c.id).startsWith('list-drop:'))
    if (list) return [list]
    const colHit = intersections.find((c) => String(c.id).startsWith('col-drop:'))
    if (colHit) {
      const colIdx = parseInt(String(colHit.id).slice('col-drop:'.length), 10)
      const pointer = args.pointerCoordinates
      if (pointer) {
        let nearestId: string | null = null
        let nearestDist = Infinity
        for (const d of args.droppableContainers) {
          const id = String(d.id)
          if (!id.startsWith('list-drop:')) continue
          const data = d.data.current as { columnIndex?: number } | undefined
          if (data?.columnIndex !== colIdx) continue
          const r = d.rect.current
          if (!r) continue
          const cy = r.top + r.height / 2
          const dist = Math.abs(cy - pointer.y)
          if (dist < nearestDist) {
            nearestDist = dist
            nearestId = id
          }
        }
        if (nearestId) {
          const found = args.droppableContainers.find((d) => String(d.id) === nearestId)
          if (found) return [{ id: found.id, data: found.data }]
        }
      }
      return [colHit]
    }
    return intersections
  }, [lists])

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
    const { over, active } = e
    const activeId = active ? String(active.id) : ''
    const isCardDrag =
      activeId.startsWith('task:') || activeId.startsWith('project:')

    if (isCardDrag) {
      // Card drag — отслеживаем над row/group/list-cards droppables.
      const overId = over ? String(over.id) : null
      // TEMP DEBUG
      setDebugInfo(`active=${activeId} | over=${overId ?? 'null'}`)
      setIsOverCalendar(!!overId && overId.startsWith('calendar-drop:'))
      if (overId && (overId.startsWith('task-row:') || overId.startsWith('project-row:'))) {
        // Парсим `task-row:<itemId>:<listId>` либо `project-row:<itemId>:<listId>`.
        const kind: BoardItemType = overId.startsWith('task-row:') ? 'thread' : 'project'
        const prefix = kind === 'thread' ? 'task-row:' : 'project-row:'
        const rest = overId.slice(prefix.length)
        const sepIdx = rest.indexOf(':')
        if (sepIdx !== -1) {
          const itemId = rest.slice(0, sepIdx)
          const listId = rest.slice(sepIdx + 1)
          // Не показываем индикатор поверх самой перетаскиваемой карточки.
          const draggedId = activeCard
            ? (activeCard.kind === 'task' ? activeCard.task.id : activeCard.project.id)
            : null
          if (draggedId === itemId) {
            setRowDropIndicator(null)
          } else {
            const overRect = over!.rect
            const pointerY = e.activatorEvent
              ? (e.activatorEvent as PointerEvent).clientY + (e.delta?.y ?? 0)
              : 0
            const midY = overRect.top + overRect.height / 2
            setRowDropIndicator({
              kind,
              listId,
              itemId,
              position: pointerY < midY ? 'top' : 'bottom',
            })
          }
          setOverCardTarget(null)
          return
        }
      }
      setRowDropIndicator(null)
      if (overId && (overId.startsWith('group:') || overId.startsWith('list-cards:'))) {
        setOverCardTarget(overId)
      } else {
        setOverCardTarget(null)
      }
      return
    }

    // List drag — существующая логика (без изменений).
    if (!over) {
      setDropIndicator(null)
      setOverColumnIndex(null)
      setGapTarget(null)
      return
    }
    const overId = String(over.id)
    if (overId.startsWith('gap-drop:')) {
      setDropIndicator(null)
      setOverColumnIndex(null)
      setGapTarget(parseInt(overId.slice('gap-drop:'.length), 10))
      return
    }
    setGapTarget(null)
    if (overId.startsWith('list-drop:')) {
      const overListId = overId.slice('list-drop:'.length)
      const overRect = over.rect
      const pointerY = e.activatorEvent ? (e.activatorEvent as PointerEvent).clientY + (e.delta?.y ?? 0) : 0
      const midY = overRect.top + overRect.height / 2
      setDropIndicator({ overListId, position: pointerY < midY ? 'top' : 'bottom' })
      const colIdx = (over.data.current as { columnIndex?: number } | undefined)?.columnIndex
      setOverColumnIndex(typeof colIdx === 'number' ? colIdx : null)
    } else if (overId.startsWith('col-drop:')) {
      setDropIndicator(null)
      setOverColumnIndex(parseInt(overId.slice('col-drop:'.length), 10))
    } else {
      setDropIndicator(null)
      setOverColumnIndex(null)
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
    setDebugInfo('')
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
      // BoardListCalendarView через useDndMonitor — здесь только
      // ранний return, чтобы не сработала status-логика для
      // calendar-drop:* over-таргетов.
      const overId = e.over ? String(e.over.id) : null
      if (overId && overId.startsWith('calendar-drop:')) return

      // 0) Drop на конкретную карточку в списке с manual_order — ручной reorder.
      if (rowInd) {
        if (rowInd.listId !== card.sourceListId) return // cross-list reorder не делаем
        const sourceList = lists.find((l) => l.id === rowInd.listId)
        if (!sourceList || sourceList.sort_by !== 'manual_order') return
        const itemType: BoardItemType = card.kind === 'project' ? 'project' : 'thread'
        if ((rowInd.kind === 'project') !== (itemType === 'project')) return
        const draggedId = card.kind === 'project' ? card.project.id : card.task.id
        if (rowInd.itemId === draggedId) return

        // Текущий порядок берём из регистра, опубликованного BoardListCard.
        const currentIds = orderRegistryRef.current[rowInd.listId]?.[itemType] ?? []
        if (currentIds.length === 0) return
        const without = currentIds.filter((id) => id !== draggedId)
        const targetIdx = without.indexOf(rowInd.itemId)
        if (targetIdx === -1) return
        const insertIdx = rowInd.position === 'bottom' ? targetIdx + 1 : targetIdx
        const newIds = [...without.slice(0, insertIdx), draggedId, ...without.slice(insertIdx)]
        if (
          newIds.length === currentIds.length &&
          newIds.every((id, i) => id === currentIds[i])
        ) {
          return
        }
        reorderItems.mutate({
          board_id: boardId,
          list_id: rowInd.listId,
          item_type: itemType,
          item_ids: newIds,
        })
        return
      }

      if (!target) return

      // Drop на конкретный статус-список = смена статуса.
      if (target.startsWith('list-cards:')) {
        const targetListId = target.slice('list-cards:'.length)
        if (targetListId === card.sourceListId) return // дроп в свой же список — no-op
        const targetList = lists.find((l) => l.id === targetListId)
        if (!targetList) return
        const newStatusId = extractStatusIdFromFilter(targetList.filters as never)
        if (newStatusId === null) return // нет status_id-фильтра — drop не имеет смысла
        if (card.kind === 'project') {
          if (statusEquals(card.project.status_id, newStatusId)) return
          updateProjectStatus.mutate({ projectId: card.project.id, statusId: newStatusId })
        } else {
          if (statusEquals(card.task.status_id, newStatusId)) return
          if (onStatusChange) onStatusChange(card.task.id, newStatusId)
        }
        return
      }

      // Drop на группу внутри списка — формат `group:<list_id>:<status_id>`.
      if (target.startsWith('group:')) {
        const rest = target.slice('group:'.length)
        const sep = rest.indexOf(':')
        if (sep === -1) return
        const targetListIdInGroup = rest.slice(0, sep)
        const targetGroupKey = rest.slice(sep + 1)
        // Drop в группу другого списка не делаем (используется list-cards для cross-list).
        if (targetListIdInGroup !== card.sourceListId) return
        const newStatusId = targetGroupKey === '__none__' ? null : targetGroupKey
        if (card.kind === 'project') {
          if (statusEquals(card.project.status_id, newStatusId)) return
          updateProjectStatus.mutate({ projectId: card.project.id, statusId: newStatusId })
        } else {
          if (statusEquals(card.task.status_id, newStatusId)) return
          if (onStatusChange) onStatusChange(card.task.id, newStatusId)
        }
        return
      }
      return
    }

    // ── List drag (существующая логика, без изменений) ─────────────
    const ind = dropIndicator
    const gap = gapTarget
    const dragged = activeList
    setActiveListId(null)
    setDropIndicator(null)
    setOverColumnIndex(null)
    setGapTarget(null)
    if (!dragged || !e.over) return

    // 1) Дроп в зазор между колонками — создаём новую колонку.
    if (gap !== null) {
      const newColumnIndex = gap
      const updates: Array<{ id: string; column_index: number; sort_order: number }> = []
      // Сдвигаем все списки с column_index >= newColumnIndex (кроме перетаскиваемого) на +1
      for (const l of lists) {
        if (l.id === dragged.id) continue
        if (l.column_index >= newColumnIndex) {
          updates.push({ id: l.id, column_index: l.column_index + 1, sort_order: l.sort_order })
        }
      }
      // Перенумеровываем sort_order в исходной колонке (без перетаскиваемого) с шагом 10
      const sourceColLists = lists
        .filter((l) => l.column_index === dragged.column_index && l.id !== dragged.id)
        .sort((a, b) => a.sort_order - b.sort_order)
      sourceColLists.forEach((l, i) => {
        const newSort = i * 10
        // Если этот список уже был сдвинут по column_index — обновим запись с правильным sort.
        const existing = updates.find((u) => u.id === l.id)
        const newColIdx = dragged.column_index >= newColumnIndex ? dragged.column_index + 1 : dragged.column_index
        if (existing) {
          existing.sort_order = newSort
        } else if (l.sort_order !== newSort) {
          updates.push({ id: l.id, column_index: newColIdx, sort_order: newSort })
        }
      })
      // Перетаскиваемый — в новую колонку.
      updates.push({ id: dragged.id, column_index: newColumnIndex, sort_order: 0 })
      reorderLists.mutate({ board_id: dragged.board_id, updates })
      return
    }

    // 2) Дроп на список или в колонку (стандартное перемещение).
    const overId = String(e.over.id)
    let targetColumnIndex: number
    let insertBeforeListId: string | null = null

    if (ind && ind.overListId) {
      const overList = lists.find((l) => l.id === ind.overListId)
      if (!overList) return
      targetColumnIndex = overList.column_index
      const targetColLists = lists
        .filter((l) => l.column_index === targetColumnIndex && l.id !== dragged.id)
        .sort((a, b) => a.sort_order - b.sort_order)
      const overIdx = targetColLists.findIndex((l) => l.id === ind.overListId)
      if (overIdx === -1) return
      const insertIdx = ind.position === 'bottom' ? overIdx + 1 : overIdx
      insertBeforeListId = targetColLists[insertIdx]?.id ?? null
    } else if (overId.startsWith('col-drop:')) {
      targetColumnIndex = parseInt(overId.slice('col-drop:'.length), 10)
      insertBeforeListId = null
    } else {
      return
    }

    const sourceColumnIndex = dragged.column_index
    const sourceColLists = lists
      .filter((l) => l.column_index === sourceColumnIndex && l.id !== dragged.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    const targetColListsRaw = targetColumnIndex === sourceColumnIndex
      ? sourceColLists
      : lists
          .filter((l) => l.column_index === targetColumnIndex && l.id !== dragged.id)
          .sort((a, b) => a.sort_order - b.sort_order)

    const insertIdx = insertBeforeListId
      ? targetColListsRaw.findIndex((l) => l.id === insertBeforeListId)
      : targetColListsRaw.length
    const newTargetCol = [
      ...targetColListsRaw.slice(0, insertIdx),
      dragged,
      ...targetColListsRaw.slice(insertIdx),
    ]

    const sameColumn = sourceColumnIndex === targetColumnIndex
    if (sameColumn) {
      const before = lists.filter((l) => l.column_index === targetColumnIndex).sort((a, b) => a.sort_order - b.sort_order)
      const same = before.length === newTargetCol.length && before.every((l, i) => l.id === newTargetCol[i].id)
      if (same) return
    }

    const updates: Array<{ id: string; column_index: number; sort_order: number }> = []
    newTargetCol.forEach((l, i) => {
      const newSort = i * 10
      if (l.column_index !== targetColumnIndex || l.sort_order !== newSort) {
        updates.push({ id: l.id, column_index: targetColumnIndex, sort_order: newSort })
      }
    })
    if (!sameColumn) {
      sourceColLists.forEach((l, i) => {
        const newSort = i * 10
        if (l.sort_order !== newSort) {
          updates.push({ id: l.id, column_index: sourceColumnIndex, sort_order: newSort })
        }
      })
    }

    if (updates.length === 0) return
    reorderLists.mutate({ board_id: dragged.board_id, updates })
  }, [activeList, dropIndicator, gapTarget, lists, reorderLists, activeCard, overCardTarget, rowDropIndicator, updateProjectStatus, onStatusChange, reorderItems, boardId])

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
      <DragOverlay dropAnimation={null}>
        {isOverCalendar ? null : activeList ? (
          <div className="px-3 py-1 rounded-full text-sm font-medium shadow-lg" style={{
            backgroundColor: hexToHeaderStyle(activeList.header_color).bg,
            color: hexToHeaderStyle(activeList.header_color).text,
          }}>
            {activeList.name}
          </div>
        ) : activeCard?.kind === 'project' ? (() => {
          const sourceList = lists.find((l) => l.id === activeCard.sourceListId)
          return (
            <div className="shadow-xl rounded-md opacity-90 bg-white">
              <BoardProjectRow
                project={activeCard.project}
                workspaceId={workspaceId}
                displayMode={sourceList?.display_mode ?? 'list'}
                visibleFields={sourceList?.visible_fields ?? ['status', 'template']}
                cardLayout={sourceList?.card_layout ?? null}
              />
            </div>
          )
        })() : activeCard?.kind === 'task' ? (() => {
          const sourceList = lists.find((l) => l.id === activeCard.sourceListId)
          return (
            <div className="shadow-xl rounded-md opacity-90 bg-white">
              <BoardTaskRow
                task={activeCard.task}
                workspaceId={workspaceId}
                assignees={assigneesMap[activeCard.task.id] ?? []}
                statuses={statuses ?? []}
                visibleFields={sourceList?.visible_fields ?? ['status', 'deadline', 'assignees', 'project']}
                displayMode={sourceList?.display_mode ?? 'list'}
                cardLayout={sourceList?.card_layout ?? null}
                onOpenTask={() => {}}
                onStatusChange={() => {}}
              />
            </div>
          )
        })() : null}
      </DragOverlay>
      {/* TEMP DEBUG — удалить когда manual-reorder заработает. */}
      {debugInfo && (
        <div
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 11,
            maxWidth: 600,
            wordBreak: 'break-all',
            pointerEvents: 'none',
          }}
        >
          {debugInfo}
        </div>
      )}
    </DndContext>
  )
}
