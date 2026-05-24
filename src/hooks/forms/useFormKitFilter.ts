"use client"

/**
 * Hook для фильтрации секций анкеты
 * Позволяет показывать только незаполненные поля
 */

import { useMemo } from 'react'
import type { FormStructure, CompositeFieldItem } from '@/components/forms/types'
import type { FieldOptions } from '@/types/formKit'
import { fromSupabaseJson } from '@/utils/supabaseJson'

interface UseFormKitFilterProps {
  structure: FormStructure | null | undefined
  formData: Record<string, string>
  compositeItems: CompositeFieldItem[]
  showOnlyUnfilled: boolean
}

/**
 * Проверяет, совпадает ли значение key-value-table с defaultRows из шаблона.
 * Если совпадает — таблица считается "незаполненной" (клиент не редактировал).
 */
function isTableUnchangedFromDefault(value: string, defaultRows?: string[][]): boolean {
  if (!value || value.trim() === '' || value === '[]') return true
  if (!defaultRows || defaultRows.length === 0) {
    // Нет шаблонных строк — проверяем, пустая ли таблица
    try {
      const parsed = JSON.parse(value)
      if (!Array.isArray(parsed) || parsed.length === 0) return true
      // Все строки пустые?
      return parsed.every(
        (row: string[]) => !Array.isArray(row) || row.every((cell) => !cell || cell.trim() === ''),
      )
    } catch {
      return true
    }
  }

  try {
    const currentRows = JSON.parse(value)
    if (!Array.isArray(currentRows)) return true
    return JSON.stringify(currentRows) === JSON.stringify(defaultRows)
  } catch {
    return true
  }
}

/**
 * Hook для фильтрации секций анкеты
 * Возвращает отфильтрованные секции в зависимости от флага showOnlyUnfilled
 */
export function useFormKitFilter({
  structure,
  formData,
  compositeItems,
  showOnlyUnfilled,
}: UseFormKitFilterProps) {
  /**
   * Фильтрация секций для показа только незаполненных полей
   */
  const filteredSections = useMemo(() => {
    if (!structure || !showOnlyUnfilled) return structure?.sections || []

    return structure.sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => {
          // Для key-value-table — сравниваем с defaultRows из шаблона
          if (field.field_type === 'key-value-table') {
            const value = formData[field.field_definition_id] || ''
            const fieldOptions = fromSupabaseJson<FieldOptions | null>(field.options)
            return isTableUnchangedFromDefault(value, fieldOptions?.defaultRows)
          }

          // Для обычных полей проверяем значение напрямую
          if (field.field_type !== 'composite') {
            const value = formData[field.field_definition_id] || ''
            return value.trim() === ''
          }

          // Для составных полей проверяем ВСЕ вложенные поля
          // Поле считается незаполненным, если хотя бы одно вложенное поле пусто
          const compositeFieldItems = compositeItems.filter(
            (item) => item.composite_field_id === field.field_definition_id,
          )
          if (compositeFieldItems.length === 0) return false // Если нет вложенных полей, считаем заполненным

          return compositeFieldItems.some((item) => {
            const compositeKey = `${field.field_definition_id}:${item.nested_field_id}`
            const value = formData[compositeKey] || ''
            return value.trim() === ''
          })
        }),
      }))
      .filter((section) => section.fields.length > 0)
  }, [structure, formData, compositeItems, showOnlyUnfilled])

  return {
    filteredSections,
  }
}
