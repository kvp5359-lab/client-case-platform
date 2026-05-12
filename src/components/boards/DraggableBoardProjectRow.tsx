"use client"

import { memo, useCallback } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
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
  /** Подсветка позиции drop'а при ручной сортировке (manual_order). */
  dropIndicator?: 'top' | 'bottom' | null
}

export const DraggableBoardProjectRow = memo(function DraggableBoardProjectRow({
  project,
  listId,
  dropIndicator,
  ...rest
}: DraggableBoardProjectRowProps) {
  const isCards = rest.displayMode === 'cards'
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    // Namespace ID, чтобы не конфликтовало с list-drag и task DnD-IDs.
    id: `project:${project.id}:${listId}`,
    data: { project, kind: 'project' as const, sourceListId: listId },
  })
  // Цель для ручного reorder (sort_by='manual_order') — обрабатывается в BoardView.
  const { setNodeRef: setDropRef } = useDroppable({ id: `project-row:${project.id}:${listId}` })

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
            isCards ? '-top-1' : 'top-0',
          )}
        />
      )}
      <BoardProjectRow project={project} {...rest} />
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
