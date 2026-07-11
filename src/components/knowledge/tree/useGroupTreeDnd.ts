/**
 * Обобщённый DnD-движок дерева базы знаний (статьи ИЛИ Q&A).
 * Порт из useKnowledgeTreeDnd — та же логика, но через TreeSource-адаптер.
 */

import { useState, useCallback } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import type { TreeSource, DropIndicatorState } from './types'

export const UNGROUPED_ID = '__ungrouped__'

export function useGroupTreeDnd<Item extends { id: string }>(source: TreeSource<Item>) {
  const [activeItem, setActiveItem] = useState<Item | null>(null)
  const [overGroupId, setOverGroupId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const { getItemGroupId, getItemsForGroup, moveItemToGroup, reorderItems, items } = source

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveItem(items.find((i) => i.id === event.active.id) ?? null)
    },
    [items],
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active } = event
      if (!over || !active) {
        setOverGroupId(null)
        setDropIndicator(null)
        return
      }

      const overId = String(over.id)
      const activeId = String(active.id)

      if (overId.startsWith('group:') || overId === UNGROUPED_ID) {
        setOverGroupId(overId === UNGROUPED_ID ? UNGROUPED_ID : overId.slice(6))
        setDropIndicator(null)
        return
      }

      if (overId !== activeId) {
        const overRect = over.rect
        if (overRect) {
          const pointerY = (event.activatorEvent as PointerEvent)?.clientY
          const deltaY = event.delta?.y ?? 0
          const currentY = pointerY != null ? pointerY + deltaY : 0
          const midY = overRect.top + overRect.height / 2
          const position: 'top' | 'bottom' = currentY < midY ? 'top' : 'bottom'

          setDropIndicator({ itemId: overId, position })
          setOverGroupId(getItemGroupId(overId))
        }
      } else {
        setDropIndicator(null)
        setOverGroupId(null)
      }
    },
    [getItemGroupId],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentDropIndicator = dropIndicator
      setActiveItem(null)
      setOverGroupId(null)
      setDropIndicator(null)

      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const fromGroupId = getItemGroupId(activeId)

      // На зону «без группы»
      if (overId === UNGROUPED_ID) {
        if (fromGroupId) moveItemToGroup({ itemId: activeId, fromGroupId, toGroupId: null })
        return
      }

      // На заголовок группы
      if (overId.startsWith('group:')) {
        const toGroupId = overId.slice(6)
        if (fromGroupId !== toGroupId) {
          moveItemToGroup({ itemId: activeId, fromGroupId, toGroupId })
        }
        return
      }

      // На другой элемент
      if (activeId === overId) return
      const toGroupId = getItemGroupId(overId)

      // Между разными группами: перенос, затем (после успеха) порядок
      if (toGroupId && fromGroupId !== toGroupId) {
        moveItemToGroup(
          { itemId: activeId, fromGroupId, toGroupId },
          {
            onSuccess: () => {
              if (!currentDropIndicator) return
              const groupItems = getItemsForGroup(toGroupId)
              const targetIdx = groupItems.findIndex((i) => i.id === overId)
              if (targetIdx === -1) return
              const insertIdx =
                currentDropIndicator.position === 'bottom' ? targetIdx + 1 : targetIdx
              const filtered = groupItems.filter((i) => i.id !== activeId).map((i) => i.id)
              const newOrder = [
                ...filtered.slice(0, insertIdx),
                activeId,
                ...filtered.slice(insertIdx),
              ]
              reorderItems({ groupId: toGroupId, itemIds: newOrder })
            },
          },
        )
        return
      }

      // Порядок внутри группы
      if (toGroupId && fromGroupId === toGroupId && currentDropIndicator) {
        const groupItems = getItemsForGroup(toGroupId)
        const fromIdx = groupItems.findIndex((i) => i.id === activeId)
        const toIdx = groupItems.findIndex((i) => i.id === overId)
        if (fromIdx === -1 || toIdx === -1) return

        const filtered = groupItems.filter((i) => i.id !== activeId)
        const adjustedToIdx = filtered.findIndex((i) => i.id === overId)
        if (adjustedToIdx === -1) return

        const insertIdx =
          currentDropIndicator.position === 'bottom' ? adjustedToIdx + 1 : adjustedToIdx

        const newOrder = [
          ...filtered.slice(0, insertIdx).map((i) => i.id),
          groupItems[fromIdx].id,
          ...filtered.slice(insertIdx).map((i) => i.id),
        ]
        reorderItems({ groupId: toGroupId, itemIds: newOrder })
      }
    },
    [getItemGroupId, getItemsForGroup, moveItemToGroup, reorderItems, dropIndicator],
  )

  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
    setOverGroupId(null)
    setDropIndicator(null)
  }, [])

  return {
    sensors,
    activeItem,
    overGroupId,
    dropIndicator,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
