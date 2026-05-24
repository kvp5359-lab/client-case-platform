"use client"

/**
 * Droppable-обёртки для BoardListCard.
 *
 * - BoardGroupDropZone — droppable вокруг одной группы внутри списка
 *   (групп.поле + значение). id: `group:<listId>:<groupKey>`.
 *
 * - BoardListCardsDropZone — droppable вокруг всего тела списка для drop
 *   карточки → меняем статус согласно фильтру списка. id: `list-cards:<listId>`.
 */

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'

export function BoardGroupDropZone({
  listId,
  groupKey,
  isActive,
  children,
}: {
  listId: string
  groupKey: string
  isActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${listId}:${groupKey}` })
  const hot = isOver || isActive
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg transition-colors',
        hot && 'bg-blue-100/40 ring-1 ring-blue-300',
      )}
    >
      {children}
    </div>
  )
}

export function BoardListCardsDropZone({
  listId,
  isActive,
  fullHeight,
  children,
}: {
  listId: string
  isActive: boolean
  /** Когда у списка list_height='full' — растягиваемся как flex-item, чтобы
   *  inner-контейнер с overflow-y-auto получил конечную высоту и реально
   *  скроллился. Для 'auto'/'medium' inner сам ограничен max-h, flex не нужен. */
  fullHeight?: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list-cards:${listId}` })
  const hot = isOver || isActive
  // min-h обязателен: иначе у пустого списка droppable-зона имеет нулевую
  // высоту и pointerWithin никогда не срабатывает — карточки не дотащить
  // до пустой колонки воронки.
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg min-h-[60px] transition-colors',
        fullHeight && 'flex flex-col flex-1 min-h-0',
        hot && 'bg-blue-100/40 ring-2 ring-blue-400',
      )}
    >
      {children}
    </div>
  )
}
