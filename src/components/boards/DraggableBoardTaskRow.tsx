"use client"

import { memo, useCallback } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { BoardTaskRow } from './BoardTaskRow'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { CardLayout, DisplayMode, VisibleField } from './types'

interface DraggableBoardTaskRowProps {
  task: WorkspaceTask
  /** Список, в котором карточка показана. Нужен для cross-list DnD (этап 4.5). */
  listId: string
  workspaceId: string
  assignees: AvatarParticipant[]
  statuses: StatusOption[]
  visibleFields: VisibleField[]
  displayMode: DisplayMode
  onOpenTask: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeleteTask?: (task: WorkspaceTask) => void
  onDeadlineChange?: (taskId: string, deadline: string | null) => void
  isSelected?: boolean
  cardLayout?: CardLayout | null
  dropIndicator: 'top' | 'bottom' | null
}

export const DraggableBoardTaskRow = memo(function DraggableBoardTaskRow({
  task,
  listId,
  dropIndicator,
  ...rest
}: DraggableBoardTaskRowProps) {
  const isCards = rest.displayMode === 'cards'
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    // Namespace ID, чтобы один и тот же task не конфликтовал, если показан
    // в нескольких списках на доске.
    id: `task:${task.id}:${listId}`,
    data: { task, kind: 'task' as const, sourceListId: listId },
  })
  // Сам task становится droppable-целью только для manual_sort reorder
  // (этап 4.5 — лифтинг DnD; manual_sort обработка в BoardView).
  const { setNodeRef: setDropRef } = useDroppable({ id: `task-row:${task.id}:${listId}` })

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      className={cn('relative min-w-0 touch-none', isDragging && 'opacity-40')}
      data-board-card
    >
      {dropIndicator === 'top' && (
        <div
          className={cn(
            'absolute left-2 right-2 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none',
            // В cards-режиме сама карточка имеет overflow-hidden + rounded —
            // полоска на top-0 обрезается. Выносим её в зазор сверху.
            isCards ? '-top-1' : 'top-0',
          )}
        />
      )}
      <BoardTaskRow task={task} {...rest} />
      {dropIndicator === 'bottom' && (
        <div
          className={cn(
            'absolute left-2 right-2 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none',
            isCards ? '-bottom-1' : 'bottom-0',
          )}
        />
      )}
    </div>
  )
})
