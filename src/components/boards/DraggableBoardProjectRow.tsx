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
  /** Список, в котором карточка показана. Нужен для cross-list DnD (этап 4.5) —
   *  на drop в другой список меняем статус, а сам source-список знаем по этому полю. */
  listId: string
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
  listId,
  ...rest
}: DraggableBoardProjectRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    // Namespace ID, чтобы не конфликтовало с list-drag и task DnD-IDs.
    id: `project:${project.id}:${listId}`,
    data: { project, kind: 'project' as const, sourceListId: listId },
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
