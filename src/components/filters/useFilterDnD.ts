"use client"

/**
 * Хук DnD-логики для FilterGroupEditor — sensors, обработчики drag-start /
 * drag-over / drag-end / drag-cancel, и состояние drop-indicator.
 *
 * Чистая логика без UI — вынесена из FilterGroupEditor, чтобы он остался
 * тонкой обёрткой над DndContext + InnerGroupEditor.
 */

import { useCallback, useState } from 'react'
import {
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core'
import {
  getRuleByPath,
  removeByPath,
  insertAtPosition,
  adjustPathAfterRemoval,
  adjustIndexAfterRemoval,
  idToPath,
} from '@/lib/filters/filterPathUtils'
import type { DropIndicatorState } from './DraggableFilterRule'
import type { FilterGroup, FilterRule } from '@/lib/filters/types'

type UseFilterDnDParams = {
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  dndPrefix: string
}

export function useFilterDnD({ group, onChange, dndPrefix }: UseFilterDnDParams) {
  const [activeRule, setActiveRule] = useState<FilterRule | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const parsed = idToPath(dndPrefix, String(event.active.id))
      if (!parsed) return
      const rule = getRuleByPath(group, parsed.path)
      if (rule) {
        setActiveRule(rule)
      }
    },
    [group, dndPrefix],
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        setDropIndicator(null)
        return
      }

      const targetParsed = idToPath(dndPrefix, String(over.id))
      if (!targetParsed) {
        setDropIndicator(null)
        return
      }

      const overRect = over.rect
      if (!overRect) {
        setDropIndicator(null)
        return
      }

      const pointerY = (event.activatorEvent as PointerEvent)?.clientY
      const deltaY = event.delta?.y ?? 0
      const currentY = pointerY != null ? pointerY + deltaY : 0
      const midY = overRect.top + overRect.height / 2
      const position: 'top' | 'bottom' = currentY < midY ? 'top' : 'bottom'

      setDropIndicator({ targetPath: targetParsed.path, position })
    },
    [dndPrefix],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const indicator = dropIndicator
      setActiveRule(null)
      setDropIndicator(null)

      const { active, over } = event
      if (!over || active.id === over.id || !indicator) return

      const sourceParsed = idToPath(dndPrefix, String(active.id))
      const targetParsed = idToPath(dndPrefix, String(over.id))
      if (!sourceParsed || !targetParsed) return

      const sourcePath = sourceParsed.path
      const targetPath = targetParsed.path

      // Не перемещаем группу внутрь себя
      if (
        targetPath.length > sourcePath.length &&
        sourcePath.every((v, i) => v === targetPath[i])
      ) {
        return
      }

      // Целевая группа — родитель target элемента
      const targetGroupPath = targetPath.slice(0, -1)
      const targetIdx = targetPath[targetPath.length - 1]
      // Позиция вставки: top → перед элементом, bottom → после
      const insertIdx = indicator.position === 'top' ? targetIdx : targetIdx + 1

      // Если перемещаем в ту же позицию — ничего не делаем
      const sourceGroupPath = sourcePath.slice(0, -1)
      const sourceIdx = sourcePath[sourcePath.length - 1]
      if (
        sourceGroupPath.join('-') === targetGroupPath.join('-') &&
        (sourceIdx === insertIdx || sourceIdx === insertIdx - 1)
      ) {
        return
      }

      // 1. Удалить из источника
      const [afterRemove, removed] = removeByPath(group, sourcePath)
      if (!removed) return

      // 2. Скорректировать target path и insertIdx после удаления
      const adjustedGroupPath = adjustPathAfterRemoval(targetGroupPath, sourcePath)
      const adjustedInsertIdx = adjustIndexAfterRemoval(adjustedGroupPath, insertIdx, sourcePath)

      // 3. Вставить на нужную позицию
      const result = insertAtPosition(afterRemove, adjustedGroupPath, adjustedInsertIdx, removed)
      onChange(result)
    },
    [group, onChange, dndPrefix, dropIndicator],
  )

  const handleDragCancel = useCallback(() => {
    setActiveRule(null)
    setDropIndicator(null)
  }, [])

  return {
    sensors,
    activeRule,
    dropIndicator,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
