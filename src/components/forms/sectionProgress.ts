/**
 * Подсчёт заполненности секции анкеты.
 * Считаются все поля кроме divider. Composite — одно поле, заполнено если все вложенные заполнены.
 * key-value-table — заполнено если значение отличается от defaultRows.
 */

import type { FormSectionWithFields, CompositeFieldItem } from './types'
import type { FieldOptions } from '@/types/formKit'
import { fromSupabaseJson } from '@/utils/supabaseJson'

export interface SectionProgress {
  filled: number
  total: number
}

function isTableFilled(value: string, defaultRows?: string[][]): boolean {
  if (!value || value.trim() === '' || value === '[]') return false
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length === 0) return false
    const allEmpty = parsed.every(
      (row: string[]) => !Array.isArray(row) || row.every((cell) => !cell || cell.trim() === ''),
    )
    if (allEmpty) return false
    if (defaultRows && defaultRows.length > 0) {
      return JSON.stringify(parsed) !== JSON.stringify(defaultRows)
    }
    return true
  } catch {
    return false
  }
}

export function computeSectionProgress(
  section: FormSectionWithFields,
  formData: Record<string, string>,
  compositeItems: CompositeFieldItem[],
): SectionProgress {
  let filled = 0
  let total = 0

  for (const field of section.fields) {
    if (field.field_type === 'divider') continue

    if (field.field_type === 'key-value-table') {
      if (!field.is_required) continue
      total += 1
      const value = formData[field.field_definition_id ?? ''] || ''
      const fieldOptions = fromSupabaseJson<FieldOptions | null>(field.options)
      if (isTableFilled(value, fieldOptions?.defaultRows)) filled += 1
      continue
    }

    if (field.field_type === 'composite') {
      // Composite раскладываем на вложенные — учитываются только обязательные nested-поля
      const items = compositeItems.filter(
        (item) => item.composite_field_id === field.field_definition_id,
      )
      for (const item of items) {
        if (!item.nested_field?.is_required) continue
        total += 1
        const key = `${field.field_definition_id}:${item.nested_field_id}`
        const value = formData[key] || ''
        if (value.trim() !== '') filled += 1
      }
      continue
    }

    if (!field.is_required) continue
    total += 1
    const value = formData[field.field_definition_id ?? ''] || ''
    if (value.trim() !== '') filled += 1
  }

  return { filled, total }
}
