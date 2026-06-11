"use client"

import { memo, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { BoardProjectRow, type NextTaskInfo } from './BoardProjectRow'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { CardLayout, DisplayMode, VisibleField } from './types'

type DraggableBoardProjectRowProps = {
  project: BoardProject
  /** Список, в котором карточка показана. Нужен для cross-list DnD (этап 4.5) —
   *  на drop в другой список меняем статус, а сам source-список знаем по этому полю. */
  listId: string
  workspaceId: string
  displayMode: DisplayMode
  visibleFields: VisibleField[]
  isSelected?: boolean
  cardLayout?: CardLayout | null
  nextTask?: NextTaskInfo
  authorName?: string | null
  /** Подсветка позиции drop'а при ручной сортировке (manual_order). */
  dropIndicator?: 'top' | 'bottom' | null
  /** Только что отпущена сюда — кратко подсвечиваем фон. */
  justDropped?: boolean
}

export const DraggableBoardProjectRow = memo(function DraggableBoardProjectRow({
  project,
  listId,
  dropIndicator,
  justDropped,
  ...rest
}: DraggableBoardProjectRowProps) {
  const isCards = rest.displayMode === 'cards'
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    // Namespace ID, чтобы не конфликтовало с list-drag и task DnD-IDs.
    id: `project:${project.id}:${listId}`,
    data: { project, kind: 'project' as const, sourceListId: listId },
  })
  // Параллельный droppable для индикатора позиции и manual_sort reorder в BoardView.
  const { setNodeRef: setDropRef } = useDroppable({ id: `project-row:${project.id}:${listId}` })

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setSortableRef(node)
      setDropRef(node)
    },
    [setSortableRef, setDropRef],
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={mergedRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'relative min-w-0 touch-none rounded-md',
        isDragging && 'opacity-40',
        justDropped && 'animate-drop-flash',
      )}
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
