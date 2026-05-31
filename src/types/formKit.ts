/**
 * Типы для работы с анкетами (form kits)
 * Удаляет использование any из formKitStore
 */

import type { Database } from '@/types/database'

// =====================================================
// Базовый тип из БД (единственный источник правды)
// =====================================================

export type FieldDefinition = Database['public']['Tables']['field_definitions']['Row']

// =====================================================
// Типизированные Json-поля (вместо generic Json)
// =====================================================

/**
 * Колонка таблицы для key-value-table полей
 */
export type TableColumn = {
  name: string
  type: 'text' | 'number' | 'date' | 'email' | 'phone'
  width?: number
}

/**
 * Ширина поля в раскладке анкеты:
 * '1/3' — треть (дефолт), '1/2' — половина, 'full' — вся ширина.
 */
export type FieldWidth = 'full' | '1/2' | '1/3'

/**
 * Опции поля (field_definitions.options, form_kit_fields.options)
 */
export type FieldOptions = {
  // Для key-value-table
  columns?: TableColumn[]
  headerColor?: string
  defaultRows?: string[][]
  // Для number полей
  minValue?: number
  maxValue?: number
  step?: number
  // Для textarea
  minLength?: number
  maxLength?: number
  // Для select (значения хранятся отдельно, но могут быть и тут)
  values?: string[]
  // Для directory_ref — id пользовательского справочника
  ref_directory_id?: string
  // Раскладка поля в анкете (только в шаблоне/анкете, не в справочнике)
  width?: FieldWidth
  newRow?: boolean
}

/**
 * Опции шаблонного поля (form_template_fields.options)
 * Расширяет базовые FieldOptions данными по умолчанию
 */
export type TemplateFieldOptions = FieldOptions

/**
 * Валидация поля (field_definitions.validation, form_kit_fields.validation)
 */
export type FieldValidation = {
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
  pattern?: string
}

export type CompositeFieldItem = {
  id: string
  name: string
  field_type: string
  sort_order: number
}
