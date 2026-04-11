/**
 * Утилиты для подготовки данных поля
 */

import type { FieldType } from '@/components/forms/types'
import { DEFAULT_TABLE_COLUMNS, type TableColumn } from './constants'

interface PreparePayloadParams {
  name: string
  fieldType: FieldType
  description: string
  selectOptions: string
  tableColumns: TableColumn[]
  minValue: string
  maxValue: string
  step: string
  minLength: string
  maxLength: string
}

/**
 * Подготавливает options для сохранения
 */
export function prepareOptions(
  fieldType: FieldType,
  selectOptions: string,
  tableColumns: TableColumn[],
): Record<string, unknown> | null {
  // Для select
  if (fieldType === 'select' && selectOptions.trim()) {
    const values = selectOptions
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
    return { values }
  }

  // Для key-value-table
  if (fieldType === 'key-value-table') {
    const validColumns = tableColumns.filter((col) => col.name.trim())
    return {
      columns: validColumns.length > 0 ? validColumns : DEFAULT_TABLE_COLUMNS,
    }
  }

  return null
}

/**
 * Подготавливает validation для сохранения
 */
export function prepareValidation(
  fieldType: FieldType,
  minValue: string,
  maxValue: string,
  step: string,
  minLength: string,
  maxLength: string,
): Record<string, number> | null {
  // !== '' вместо falsy-проверки, чтобы "0" не пропускалось
  if (fieldType === 'number') {
    const validation: Record<string, number> = {}
    if (minValue !== '') validation.min = parseFloat(minValue)
    if (maxValue !== '') validation.max = parseFloat(maxValue)
    if (step !== '') validation.step = parseFloat(step)
    return Object.keys(validation).length > 0 ? validation : null
  }

  if (fieldType === 'text' || fieldType === 'textarea') {
    const validation: Record<string, number> = {}
    if (minLength !== '') validation.minLength = parseInt(minLength, 10)
    if (maxLength !== '') validation.maxLength = parseInt(maxLength, 10)
    return Object.keys(validation).length > 0 ? validation : null
  }

  return null
}

/**
 * Подготавливает полный payload для сохранения
 */
export function prepareFieldPayload(params: PreparePayloadParams) {
  const {
    name,
    fieldType,
    description,
    selectOptions,
    tableColumns,
    minValue,
    maxValue,
    step,
    minLength,
    maxLength,
  } = params

  return {
    name: name.trim(),
    field_type: fieldType,
    description: description.trim() || null,
    options: prepareOptions(fieldType, selectOptions, tableColumns),
    validation: prepareValidation(fieldType, minValue, maxValue, step, minLength, maxLength),
  }
}
