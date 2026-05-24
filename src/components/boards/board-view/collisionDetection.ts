/**
 * Кастомный collision detection для DndContext в BoardView.
 *
 * Иерархия:
 *  - drag списка: gap-drop → list-drop → col-drop (rectIntersection)
 *  - drag карточки: row(manual_order) → group → list-cards → calendar-drop
 *    (pointerWithin + поиск ближайшего таргета по Y)
 *
 * Вынесено из BoardView — pure function, легко тестируется.
 */

import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core'
import type { BoardList } from '../types'

export function makeBoardCollisionDetection(lists: BoardList[]): CollisionDetection {
  return (args) => {
    const activeId = args.active ? String(args.active.id) : ''
    const isCardDrag = activeId.startsWith('task:') || activeId.startsWith('project:')

    if (isCardDrag) {
      // ВАЖНО: для карточек DragOverlay прячет реальный элемент за курсором,
      // и rectIntersection ловит исходную позицию. Используем pointerWithin —
      // он работает по координате курсора.
      const collisions = pointerWithin(args)
      // Приоритет 1: drop на конкретную карточку (ручной reorder) — только если
      // карточка в списке с sort_by='manual_order'. Иначе игнорируем.
      const row = collisions.find((c) => {
        const id = String(c.id)
        if (!id.startsWith('task-row:') && !id.startsWith('project-row:')) return false
        const parts = id.split(':')
        const listId = parts[2]
        const list = lists.find((l) => l.id === listId)
        return list?.sort_by === 'manual_order'
      })
      if (row) return [row]

      // Указатель в list-cards/group любого manual_order-списка (между
      // карточками, над/под ними) — ищем ближайшую task-row/project-row того
      // же списка по Y, чтобы синяя полоска появлялась всегда, а не только
      // точно над карточкой.
      const rowPrefix = activeId.startsWith('task:') ? 'task-row:' : 'project-row:'
      if (args.pointerCoordinates) {
        // Список, чья list-cards/group зона под курсором сейчас.
        let targetListId: string | null = null
        for (const c of collisions) {
          const id = String(c.id)
          if (id.startsWith('list-cards:')) {
            targetListId = id.slice('list-cards:'.length)
            break
          }
          if (id.startsWith('group:')) {
            const rest = id.slice('group:'.length)
            const sep = rest.indexOf(':')
            if (sep !== -1) {
              targetListId = rest.slice(0, sep)
              break
            }
          }
        }
        const targetList = targetListId ? lists.find((l) => l.id === targetListId) : null
        if (targetList?.sort_by === 'manual_order') {
          const pointerY = args.pointerCoordinates.y
          let nearestId: string | null = null
          let nearestDist = Infinity
          for (const d of args.droppableContainers) {
            const id = String(d.id)
            if (!id.startsWith(rowPrefix)) continue
            if (!id.endsWith(`:${targetListId}`)) continue
            const r = d.rect.current
            if (!r) continue
            const cy = r.top + r.height / 2
            const dist = Math.abs(cy - pointerY)
            if (dist < nearestDist) {
              nearestDist = dist
              nearestId = id
            }
          }
          if (nearestId) {
            const found = args.droppableContainers.find((d) => String(d.id) === nearestId)
            if (found) return [{ id: found.id, data: found.data }]
          }
        }
      }

      // Календарный drop-таргет — приоритет выше list-cards, потому что
      // календарь вложен в list-cards и pointerWithin вернёт оба.
      const calendar = collisions.find((c) => String(c.id).startsWith('calendar-drop:'))
      if (calendar) return [calendar]
      const group = collisions.find((c) => String(c.id).startsWith('group:'))
      if (group) return [group]
      const listCards = collisions.find((c) => String(c.id).startsWith('list-cards:'))
      if (listCards) return [listCards]
      return collisions.filter((c) => {
        const id = String(c.id)
        // `task:`/`project:` — id самих sortable-нод (useSortable создаёт droppable
        // с тем же id, что и draggable). Это самосовпадение, drop-таргетом быть
        // не должен — иначе перебивает приоритет list-cards/group.
        return (
          !id.startsWith('gap-drop:') &&
          !id.startsWith('list-drop:') &&
          !id.startsWith('col-drop:') &&
          !id.startsWith('task:') &&
          !id.startsWith('project:')
        )
      })
    }

    // List drag — существующая логика на rectIntersection (списки не используют overlay).
    const intersections = rectIntersection(args)
    const gap = intersections.find((c) => String(c.id).startsWith('gap-drop:'))
    if (gap) return [gap]
    const list = intersections.find((c) => String(c.id).startsWith('list-drop:'))
    if (list) return [list]
    const colHit = intersections.find((c) => String(c.id).startsWith('col-drop:'))
    if (colHit) {
      const colIdx = parseInt(String(colHit.id).slice('col-drop:'.length), 10)
      const pointer = args.pointerCoordinates
      if (pointer) {
        let nearestId: string | null = null
        let nearestDist = Infinity
        for (const d of args.droppableContainers) {
          const id = String(d.id)
          if (!id.startsWith('list-drop:')) continue
          const data = d.data.current as { columnIndex?: number } | undefined
          if (data?.columnIndex !== colIdx) continue
          const r = d.rect.current
          if (!r) continue
          const cy = r.top + r.height / 2
          const dist = Math.abs(cy - pointer.y)
          if (dist < nearestDist) {
            nearestDist = dist
            nearestId = id
          }
        }
        if (nearestId) {
          const found = args.droppableContainers.find((d) => String(d.id) === nearestId)
          if (found) return [{ id: found.id, data: found.data }]
        }
      }
      return [colHit]
    }
    return intersections
  }
}
