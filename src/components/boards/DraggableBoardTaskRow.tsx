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
  workspaceId: string
  assignees: AvatarParticipant[]
  statuses: StatusOption[]
  visibleFields: VisibleField[]
  displayMode: DisplayMode
  onOpenTask: (taskId: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  isSelected?: boolean
  cardLayout?: CardLayout | null
  dropIndicator: 'top' | 'bottom' | null
}

export const DraggableBoardTaskRow = memo(function DraggableBoardTaskRow({
  task,
  dropIndicator,
  ...rest
}: DraggableBoardTaskRowProps) {
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
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      className={cn('relative min-w-0 touch-none', isDragging && 'opacity-40')}
      data-board-card
    >
      {dropIndicator === 'top' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none" />
      )}
      <BoardTaskRow task={task} {...rest} />
      {dropIndicator === 'bottom' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none" />
      )}
    </div>
  )
})
