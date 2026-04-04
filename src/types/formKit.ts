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
export interface TableColumn {
  name: string
  type: 'text' | 'number' | 'date' | 'email' | 'phone'
  width?: number
}

/**
 * Опции поля (field_definitions.options, form_kit_fields.options)
 */
export interface FieldOptions {
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
}

/**
 * Опции шаблонного поля (form_template_fields.options)
 * Расширяет базовые FieldOptions данными по умолчанию
 */
export type TemplateFieldOptions = FieldOptions

/**
 * Валидация поля (field_definitions.validation, form_kit_fields.validation)
 */
export interface FieldValidation {
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
  pattern?: string
}

export interface CompositeFieldItem {
  id: string
  name: string
  field_type: string
  sort_order: number
}
