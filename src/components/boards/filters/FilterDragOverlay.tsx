"use client"

/**
 * Содержимое DragOverlay dnd-kit для правил фильтров — отдельная карточка,
 * следующая за курсором во время перетаскивания. Поддерживает два варианта:
 *   - правило-условие (field operator value)
 *   - группа правил (И/ИЛИ + количество условий)
 *
 * Вынесено из FilterGroupEditor.tsx (аудит 2026-04-11, Зона 6).
 */

import { GripVertical } from 'lucide-react'
import { getFieldsForEntity } from './filterDefinitions'
import type { FilterRule } from '../types'

interface FilterDragOverlayProps {
  rule: FilterRule
  entityType: 'task' | 'project'
}

export function FilterDragOverlay({ rule, entityType }: FilterDragOverlayProps) {
  if (rule.type === 'condition') {
    const fields = getFieldsForEntity(entityType)
    const field = fields.find((f) => f.key === rule.field)
    return (
      <div className="bg-background border rounded-md px-3 py-2 shadow-lg text-xs flex items-center gap-2 max-w-[400px]">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">{field?.label ?? rule.field}</span>
        <span className="text-muted-foreground">{rule.operator}</span>
        <span className="truncate">{String(rule.value ?? '')}</span>
      </div>
    )
  }
  return (
    <div className="bg-background border rounded-md px-3 py-2 shadow-lg text-xs flex items-center gap-2">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="font-medium">Группа ({rule.group.logic === 'and' ? 'И' : 'ИЛИ'})</span>
      <span className="text-muted-foreground">{rule.group.rules.length} усл.</span>
    </div>
  )
}
