"use client"

/**
 * Маленькие droppable-обёртки колонок BoardView. Вынесены чтобы не
 * раздувать главный BoardView.tsx — сама эта DnD-обвязка тонкая и
 * не зависит от остальной board-логики.
 */

import { useDroppable } from '@dnd-kit/core'

export function DroppableColumn({
  columnIndex,
  width,
  isActiveTarget,
  children,
}: {
  columnIndex: number
  width: number
  isActiveTarget: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-drop:${columnIndex}` })
  return (
    <div
      ref={setNodeRef}
      data-board-column
      className={
        // snap-start — точка прилипания свайпа на мобиле (на десктопе контейнер
        // отключает snap через md:snap-none). Ширина на мобиле перебивается
        // на 100vw в globals.css по селектору [data-board-column].
        'shrink-0 h-full rounded-lg transition-colors snap-start ' +
        (isOver || isActiveTarget ? 'bg-blue-100/40' : '')
      }
      style={{ width: `${width}px` }}
    >
      {children}
    </div>
  )
}

export function ColumnGap({
  gapIndex,
  active,
  visible,
  isFirst,
}: {
  gapIndex: number
  active: boolean
  visible: boolean
  isFirst?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap-drop:${gapIndex}` })
  const hot = active || isOver
  return (
    <div
      ref={setNodeRef}
      className={
        'relative shrink-0 h-full transition-all ' +
        (hot ? 'w-6' : visible ? 'w-4' : isFirst ? 'w-0' : 'w-4')
      }
      aria-label={`gap-${gapIndex}`}
    >
      {hot && (
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 rounded-full bg-blue-500 pointer-events-none" />
      )}
    </div>
  )
}
