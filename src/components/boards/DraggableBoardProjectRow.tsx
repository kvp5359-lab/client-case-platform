"use client"

/**
 * Обёртка вокруг BoardProjectRow с поддержкой drag-n-drop (этап 4.3 CRM-фрейма).
 * Позволяет перетаскивать карточку проекта между группами (= статусами).
 *
 * Сама перестановка внутри группы не делает ничего — у проектов нет sort_order
 * на доске. Drop в другую группу обрабатывается DndContext'ом в BoardListCard
 * через droppable-обёртку группы (id вида `project-group:<status_id>`).
 */

import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { BoardProjectRow } from './BoardProjectRow'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { CardLayout, DisplayMode, VisibleField } from './types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

interface DraggableBoardProjectRowProps {
  project: BoardProject
  workspaceId: string
  displayMode: DisplayMode
  visibleFields: VisibleField[]
  isSelected?: boolean
  cardLayout?: CardLayout | null
  nextTask?: WorkspaceTask
  authorName?: string | null
}

export const DraggableBoardProjectRow = memo(function DraggableBoardProjectRow({
  project,
  ...rest
}: DraggableBoardProjectRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `project:${project.id}`,
    data: { project, kind: 'project' },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('relative min-w-0 touch-none', isDragging && 'opacity-40')}
      data-board-card
    >
      <BoardProjectRow project={project} {...rest} />
    </div>
  )
})
