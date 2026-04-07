"use client"

/**
 * Рендер сгруппированного списка задач с секцией «Завершены».
 * Drag & drop: линия-индикатор (не sortable раздвигание).
 * Перестановка внутри группы + перенос между группами (меняет дедлайн).
 */

import { useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { DeadlineGroup } from '@/utils/deadlineUtils'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { TaskRow } from './TaskRow'
import type { TaskItem } from './types'
import { GROUP_ORDER, GROUP_LABELS, GROUP_COLORS } from './taskListConstants'

// ── Drop indicator state ──

interface DropIndicatorState {
  taskId: string
  position: 'top' | 'bottom'
}

// ── Draggable + Droppable TaskRow wrapper ──

function DraggableTaskRow({
  task,
  workspaceId,
  statuses,
  members,
  onOpen,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  deadlinePending,
  showProject,
  dropIndicator,
}: {
  task: TaskItem
  workspaceId: string
  statuses: TaskStatus[]
  members: AvatarParticipant[]
  onOpen: () => void
  onStatusChange: (statusId: string | null) => void
  onDeadlineSet: (date: Date) => void
  onDeadlineClear: () => void
  deadlinePending: boolean
  showProject: boolean
  dropIndicator: 'top' | 'bottom' | null
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  })
  const { setNodeRef: setDropRef } = useDroppable({ id: task.id })

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  return (
    <div className="relative">
      {dropIndicator === 'top' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      <TaskRow
        ref={mergedRef}
        task={task}
        workspaceId={workspaceId}
        statuses={statuses}
        members={members}
        onOpen={onOpen}
        onStatusChange={onStatusChange}
        onDeadlineSet={onDeadlineSet}
        onDeadlineClear={onDeadlineClear}
        deadlinePending={deadlinePending}
        showProject={showProject}
        dragHandleProps={{ attributes, listeners }}
        isDragging={isDragging}
      />
      {dropIndicator === 'bottom' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
    </div>
  )
}

// ── Утилита: дата дедлайна для группы ──

function getDeadlineDateForGroup(group: DeadlineGroup): Date | null {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)

  switch (group) {
    case 'overdue':
      return null
    case 'today':
      return today
    case 'tomorrow': {
      const d = new Date(today)
      d.setDate(d.getDate() + 1)
      return d
    }
    case 'this_week': {
      const d = new Date(today)
      d.setDate(d.getDate() + 2)
      return d
    }
    case 'later': {
      const d = new Date(today)
      const dayOfWeek = d.getDay()
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
      d.setDate(d.getDate() + daysUntilMonday)
      return d
    }
    case 'no_deadline':
      return new Date(0) // sentinel: снять дедлайн
  }
}

// ── Основной компонент ──

interface TaskGroupListProps {
  grouped: Map<DeadlineGroup, TaskItem[]>
  completedTasks: TaskItem[]
  workspaceId: string
  taskStatuses: TaskStatus[]
  membersMap: Record<string, AvatarParticipant[]>
  showProject: boolean
  onOpenTask: (id: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeadlineSet: (taskId: string, date: Date) => void
  onDeadlineClear: (taskId: string) => void
  onReorder: (updates: { id: string; sort_order: number }[]) => void
  deadlinePending: boolean
}

export function TaskGroupList({
  grouped,
  completedTasks,
  workspaceId,
  taskStatuses,
  membersMap,
  showProject,
  onOpenTask,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onReorder,
  deadlinePending,
}: TaskGroupListProps) {
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // Быстрый поиск: task id → группа
  const taskToGroup = useMemo(() => {
    const map = new Map<string, DeadlineGroup>()
    for (const group of GROUP_ORDER) {
      const items = grouped.get(group)
      if (items) {
        for (const item of items) map.set(item.id, group)
      }
    }
    return map
  }, [grouped])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskItem | undefined
    setActiveTask(task ?? null)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active } = event
      if (!over || !active) {
        setDropIndicator(null)
        return
      }

      const overId = String(over.id)
      const activeId = String(active.id)

      if (overId === activeId) {
        setDropIndicator(null)
        return
      }

      const overRect = over.rect
      if (overRect) {
        const pointerY = (event.activatorEvent as PointerEvent)?.clientY
        const deltaY = event.delta?.y ?? 0
        const currentY = pointerY != null ? pointerY + deltaY : 0
        const midY = overRect.top + overRect.height / 2
        const position: 'top' | 'bottom' = currentY < midY ? 'top' : 'bottom'

        setDropIndicator({ taskId: overId, position })
      }
    },
    [],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentDropIndicator = dropIndicator
      setActiveTask(null)
      setDropIndicator(null)

      const { active, over } = event
      if (!over || !currentDropIndicator) return

      const activeId = String(active.id)
      const overId = String(over.id)
      if (activeId === overId) return

      const fromGroup = taskToGroup.get(activeId)
      const toGroup = taskToGroup.get(overId)
      if (!fromGroup || !toGroup) return

      // Собираем целевой список и вставляем задачу в нужную позицию
      const targetItems = [...(grouped.get(toGroup) ?? [])]
      const filtered = targetItems.filter((t) => t.id !== activeId)
      const overIndex = filtered.findIndex((t) => t.id === overId)
      if (overIndex === -1) return

      const insertIndex = currentDropIndicator.position === 'bottom' ? overIndex + 1 : overIndex

      // Получаем перетаскиваемый элемент из исходной группы
      const sourceItems = grouped.get(fromGroup) ?? []
      const draggedTask = sourceItems.find((t) => t.id === activeId)
      if (!draggedTask) return

      const newOrder = [
        ...filtered.slice(0, insertIndex),
        draggedTask,
        ...filtered.slice(insertIndex),
      ]

      // Пересчитываем sort_order
      const updates = newOrder.map((task, idx) => ({
        id: task.id,
        sort_order: idx * 10,
      }))
      onReorder(updates)

      // Перенос между группами — меняем дедлайн
      if (fromGroup !== toGroup) {
        const deadlineDate = getDeadlineDateForGroup(toGroup)
        if (deadlineDate === null) return

        if (deadlineDate.getTime() === 0) {
          onDeadlineClear(activeId)
        } else {
          onDeadlineSet(activeId, deadlineDate)
        }
      }
    },
    [taskToGroup, grouped, onReorder, onDeadlineSet, onDeadlineClear, dropIndicator],
  )

  const handleDragCancel = useCallback(() => {
    setActiveTask(null)
    setDropIndicator(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-6">
        {GROUP_ORDER.map((group) => {
          const items = grouped.get(group)
          if (!items || items.length === 0) return null

          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <h2
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    GROUP_COLORS[group],
                  )}
                >
                  {GROUP_LABELS[group]}
                </h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>

              <div>
                {items.map((task) => (
                  <DraggableTaskRow
                    key={task.id}
                    task={task}
                    workspaceId={workspaceId}
                    statuses={taskStatuses}
                    members={membersMap[task.id] ?? []}
                    onOpen={() => onOpenTask(task.id)}
                    onStatusChange={(statusId) => onStatusChange(task.id, statusId)}
                    onDeadlineSet={(date) => onDeadlineSet(task.id, date)}
                    onDeadlineClear={() => onDeadlineClear(task.id)}
                    deadlinePending={deadlinePending}
                    showProject={showProject}
                    dropIndicator={
                      dropIndicator?.taskId === task.id ? dropIndicator.position : null
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* Секция «Завершены» — без drag & drop */}
        {completedTasks.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setCompletedExpanded((v) => !v)}
              className="flex items-center gap-2 mb-2 group"
            >
              {completedExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Завершены
              </h2>
              <span className="text-xs text-muted-foreground">{completedTasks.length}</span>
            </button>
            {completedExpanded && (
              <div className="opacity-60">
                {completedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    workspaceId={workspaceId}
                    statuses={taskStatuses}
                    members={membersMap[task.id] ?? []}
                    onOpen={() => onOpenTask(task.id)}
                    onStatusChange={(statusId) => onStatusChange(task.id, statusId)}
                    onDeadlineSet={(date) => onDeadlineSet(task.id, date)}
                    onDeadlineClear={() => onDeadlineClear(task.id)}
                    deadlinePending={deadlinePending}
                    showProject={showProject}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag overlay — призрак задачи */}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="shadow-xl rounded-md opacity-80">
            <TaskRow
              task={activeTask}
              workspaceId={workspaceId}
              statuses={taskStatuses}
              members={membersMap[activeTask.id] ?? []}
              onOpen={() => {}}
              onStatusChange={() => {}}
              onDeadlineSet={() => {}}
              onDeadlineClear={() => {}}
              deadlinePending={false}
              showProject={showProject}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
