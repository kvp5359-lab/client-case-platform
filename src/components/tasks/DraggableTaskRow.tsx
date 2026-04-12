"use client"

import { useCallback, useMemo, memo } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { TaskRow } from './TaskRow'
import type { TaskItem } from './types'

// ── Draggable + Droppable TaskRow wrapper ──

/**
 * Props для DraggableTaskRow.
 *
 * Ключевой момент: callbacks принимают task.id / task в аргументах, а НЕ
 * замкнуты на конкретную задачу через inline-стрелки на стороне родителя.
 * Это позволяет `React.memo` корректно работать — родительский ре-рендер
 * (например, при изменении `activeTask` во время drag) не пересоздаёт
 * props и не перерисовывает все карточки списка.
 */
export interface DraggableTaskRowProps {
  task: TaskItem
  workspaceId: string
  statuses: TaskStatus[]
  members: AvatarParticipant[]
  onOpen: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeadlineSet: (taskId: string, date: Date) => void
  onDeadlineClear: (taskId: string) => void
  deadlinePending: boolean
  finalStatusIds: Set<string>
  showProject: boolean
  dropIndicator: 'top' | 'bottom' | null
  onRequestDelete?: (task: TaskItem) => void
}

export const DraggableTaskRow = memo(function DraggableTaskRow({
  task,
  workspaceId,
  statuses,
  members,
  onOpen,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  deadlinePending,
  finalStatusIds,
  showProject,
  dropIndicator,
  onRequestDelete,
}: DraggableTaskRowProps) {
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

  // Стабильные лямбды под task.id — пересоздаются только при смене задачи
  // или родительского колбэка. TaskRow ожидает parameterless колбэки,
  // поэтому адаптируем здесь.
  const handleOpen = useCallback(() => onOpen(task.id), [onOpen, task.id])
  const handleStatusChange = useCallback(
    (statusId: string | null) => onStatusChange(task.id, statusId),
    [onStatusChange, task.id],
  )
  const handleDeadlineSet = useCallback(
    (date: Date) => onDeadlineSet(task.id, date),
    [onDeadlineSet, task.id],
  )
  const handleDeadlineClear = useCallback(
    () => onDeadlineClear(task.id),
    [onDeadlineClear, task.id],
  )
  const handleRequestDelete = useMemo(
    () => (onRequestDelete ? () => onRequestDelete(task) : undefined),
    [onRequestDelete, task],
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
        onOpen={handleOpen}
        onStatusChange={handleStatusChange}
        onDeadlineSet={handleDeadlineSet}
        onDeadlineClear={handleDeadlineClear}
        deadlinePending={deadlinePending}
        finalStatusIds={finalStatusIds}
        showProject={showProject}
        dragHandleProps={{ attributes, listeners }}
        isDragging={isDragging}
        onRequestDelete={handleRequestDelete}
      />
      {dropIndicator === 'bottom' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
    </div>
  )
})
