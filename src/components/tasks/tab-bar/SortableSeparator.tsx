"use client"

/**
 * Серый разделитель pinned/unpinned в TaskPanelTabBar. Sortable, но без
 * drag-листенеров — пользователь его не схватит, зато соседи расступаются
 * вокруг него как и вокруг остальных вкладок.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const SEPARATOR_ID = '__pin_separator__'

export function SortableSeparator() {
  const { setNodeRef, transform, transition } = useSortable({ id: SEPARATOR_ID })
  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString({ ...transform, y: 0 }) : undefined,
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="self-stretch w-3 flex items-center justify-center shrink-0"
      aria-hidden
    >
      <div className="self-stretch w-px bg-gray-300" />
    </div>
  )
}
