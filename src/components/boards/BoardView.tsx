"use client"

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { BoardColumn } from './BoardColumn'
import { usePanDrag } from './hooks/usePanDrag'
import { useReorderLists } from './hooks/useListMutations'
import { DEFAULT_COLUMN_WIDTH, type BoardList, type FilterContext } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'
import { hexToHeaderStyle } from './types'

interface BoardViewProps {
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
  onOpenTask?: (taskId: string) => void
  onOpenThread?: (task: TaskItem) => void
  onStatusChange?: (taskId: string, statusId: string | null) => void
  selectedThreadId?: string | null
  /** id проекта, открытого в боковой панели — соответствующая строка подсвечивается. */
  selectedProjectId?: string | null
}

export function BoardView({
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
  onOpenTask,
  onOpenThread,
  onStatusChange,
  selectedThreadId,
  selectedProjectId,
}: BoardViewProps) {
  const reorderLists = useReorderLists()

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const activeList = activeListId ? lists.find((l) => l.id === activeListId) ?? null : null

  // Кастомный collision detection: при drag списка предпочитаем gap → list → col.
  // Если курсор внутри колонки, но не на конкретном списке, выбираем ближайший по Y список,
  // чтобы стрелка-индикатор показывала "выше/ниже" даже если мышь в зазоре между списками
  // или над первым списком.
  const collisionDetection: CollisionDetection = useCallback((args) => {
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
  }, [])

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const id = String(e.active.id)
    if (!id.startsWith('list-drag:')) return
    setActiveListId(id.slice('list-drag:'.length))
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { over } = e
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
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveListId(null)
    setDropIndicator(null)
    setOverColumnIndex(null)
    setGapTarget(null)
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
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
  }, [activeList, dropIndicator, gapTarget, lists, reorderLists])

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
          <div key={col.index} className="flex shrink-0">
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
                onOpenTask={onOpenTask ?? (() => {})}
                onOpenThread={onOpenThread ?? (() => {})}
                onStatusChange={onStatusChange ?? (() => {})}
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
        {activeList ? (
          <div className="px-3 py-1 rounded-full text-sm font-medium shadow-lg" style={{
            backgroundColor: hexToHeaderStyle(activeList.header_color).bg,
            color: hexToHeaderStyle(activeList.header_color).text,
          }}>
            {activeList.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function DroppableColumn({ columnIndex, width, isActiveTarget, children }: { columnIndex: number; width: number; isActiveTarget: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-drop:${columnIndex}` })
  return (
    <div
      ref={setNodeRef}
      className={'shrink-0 rounded-lg transition-colors ' + ((isOver || isActiveTarget) ? 'bg-blue-100/40' : '')}
      style={{ width: `${width}px` }}
    >
      {children}
    </div>
  )
}

function ColumnGap({ gapIndex, active, visible, isFirst }: { gapIndex: number; active: boolean; visible: boolean; isFirst?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap-drop:${gapIndex}` })
  const hot = active || isOver
  return (
    <div
      ref={setNodeRef}
      className={'relative shrink-0 h-full transition-all ' + (hot ? 'w-6' : visible ? 'w-4' : isFirst ? 'w-0' : 'w-4')}
      aria-label={`gap-${gapIndex}`}
    >
      {hot && (
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 rounded-full bg-blue-500 pointer-events-none" />
      )}
    </div>
  )
}
