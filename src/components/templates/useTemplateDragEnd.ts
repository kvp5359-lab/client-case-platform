/**
 * Обвязка сортировки списков шаблонов перетаскиванием.
 *
 * Собирает то, что одинаково у всех таких списков: сенсор с порогом (чтобы клик
 * по строке не считался перетаскиванием), пересчёт порядка после броска и
 * запрет перетаскивания во время поиска.
 */

import { PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

type UseTemplateDragEndOptions<T extends { id: string }> = {
  /** Список в том порядке, в котором он отрисован. */
  items: T[]
  /** Получает id в новом порядке. */
  onReorder: (orderedIds: string[]) => void
  /**
   * Текущий поисковый запрос. При активном поиске список отфильтрован, и
   * перестановка внутри него посчитала бы порядок только по видимым строкам,
   * перетасовав скрытые, — поэтому перетаскивание отключается.
   */
  searchQuery?: string
}

export function useTemplateDragEnd<T extends { id: string }>({
  items,
  onReorder,
  searchQuery = '',
}: UseTemplateDragEndOptions<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const dragDisabled = searchQuery.trim().length > 0

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((i) => i.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(ids, oldIndex, newIndex))
  }

  return { sensors, dragDisabled, handleDragEnd }
}
