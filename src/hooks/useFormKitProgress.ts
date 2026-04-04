"use client"

/**
 * useFormKitProgress — хук для расчёта прогресса заполнения анкеты
 *
 * Также экспортирует getSectionProgress для расчёта прогресса отдельной секции
 * (используется в FormStepper)
 */

import { useMemo } from 'react'
import type {
  FormStructure,
  FormData,
  FormProgress,
  FormSectionWithFields,
  CompositeFieldItem,
} from '@/components/forms/types'

interface UseFormKitProgressParams {
  structure: FormStructure | null | undefined
  formData: FormData
  compositeItems?: CompositeFieldItem[]
}

export interface SectionProgress {
  total: number
  filled: number
  isComplete: boolean
}

/**
 * Статус заполнения обязательных полей секции:
 * - 'complete' — все обязательные заполнены
 * - 'in_progress' — часть заполнена
 * - 'empty' — ничего не заполнено (или нет обязательных)
 */
export type SectionRequiredStatus = 'complete' | 'in_progress' | 'empty'

/**
 * Z2-23: DRY — единый обход полей секции с учётом composite fields.
 * Принимает предикат для фильтрации полей (все / только обязательные).
 */
function countSectionFields(
  section: FormSectionWithFields,
  formData: FormData,
  compositeItems: CompositeFieldItem[],
  filter: 'all' | 'required',
): { total: number; filled: number } {
  let total = 0
  let filled = 0

  for (const field of section.fields) {
    const defId = field.field_definition_id
    if (!defId) continue
    if (field.field_type === 'divider') continue

    if (field.field_type === 'composite') {
      const items = compositeItems.filter((ci) => ci.composite_field_id === defId)
      for (const item of items) {
        if (!item.nested_field) continue
        if (filter === 'required' && !item.nested_field.is_required) continue
        total++
        const key = `${defId}:${item.nested_field.id}`
        if ((formData[key] || '').trim() !== '') filled++
      }
    } else {
      if (filter === 'required' && !field.is_required) continue
      total++
      if ((formData[defId] || '').trim() !== '') filled++
    }
  }

  return { total, filled }
}

/**
 * Расчёт прогресса для одной секции с учётом composite fields
 * Единый источник правды — используется и в хуке, и в FormStepper
 */
export function getSectionProgress(
  section: FormSectionWithFields,
  formData: FormData,
  compositeItems: CompositeFieldItem[] = [],
): SectionProgress {
  const { total, filled } = countSectionFields(section, formData, compositeItems, 'all')
  return { total, filled, isComplete: total > 0 && filled === total }
}

/**
 * Определяет статус заполнения секции:
 * - Если есть обязательные поля — считаем по ним
 * - Если обязательных нет — считаем по всем полям секции
 */
export function getSectionRequiredStatus(
  section: FormSectionWithFields,
  formData: FormData,
  compositeItems: CompositeFieldItem[] = [],
): SectionRequiredStatus {
  const req = countSectionFields(section, formData, compositeItems, 'required')

  if (req.total > 0) {
    if (req.filled === 0) return 'empty'
    if (req.filled >= req.total) return 'complete'
    return 'in_progress'
  }

  const all = countSectionFields(section, formData, compositeItems, 'all')
  if (all.total === 0) return 'empty'
  if (all.filled === 0) return 'empty'
  if (all.filled >= all.total) return 'complete'
  return 'in_progress'
}

export function useFormKitProgress({
  structure,
  formData,
  compositeItems = [],
}: UseFormKitProgressParams): FormProgress {
  return useMemo(() => {
    if (!structure) {
      return {
        total: 0,
        filled: 0,
        percentage: 0,
        requiredFilled: 0,
        requiredTotal: 0,
      }
    }

    let total = 0
    let filled = 0
    let requiredTotal = 0
    let requiredFilled = 0

    structure.sections.forEach((section) => {
      const all = countSectionFields(section, formData, compositeItems, 'all')
      total += all.total
      filled += all.filled

      const req = countSectionFields(section, formData, compositeItems, 'required')
      requiredTotal += req.total
      requiredFilled += req.filled
    })

    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0

    return {
      total,
      filled,
      percentage,
      requiredFilled,
      requiredTotal,
    }
  }, [structure, formData, compositeItems])
}
