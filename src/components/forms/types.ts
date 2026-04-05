/**
 * Типы для работы с формами и анкетами
 */

import { Database } from '@/types/database'
import type { FieldDefinition } from '@/types/formKit'

// Базовые типы из database
export type FieldType = Database['public']['Enums']['field_type']
export type FormKit = Database['public']['Tables']['form_kits']['Row']
export type FormTemplate = Database['public']['Tables']['form_templates']['Row']
export type { FieldDefinition }
export type FormKitFieldValue = Database['public']['Tables']['form_kit_field_values']['Row']
export type Status = Database['public']['Tables']['statuses']['Row']

// Расширенные типы для работы с формами

/**
 * Поле с метаданными для отображения в форме
 */
export interface FormField extends FieldDefinition {
  is_required: boolean
  sort_order: number
  section_id: string | null
  field_definition_id: string // ID определения поля
}

/**
 * Секция с полями для отображения
 */
export interface FormSectionWithFields {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  sort_order: number
  status?: string | null // ID статуса секции
  status_data?: Status | null // Данные статуса (загружаются через join)
}

/**
 * Структура формы с секциями и полями
 */
export interface FormStructure {
  template: FormTemplate
  sections: FormSectionWithFields[]
}

/**
 * Данные формы (ключ = field_definition_id, значение = строка)
 */
export type FormData = Record<string, string>

/**
 * Статистика заполнения формы
 */
export interface FormProgress {
  total: number
  filled: number
  percentage: number
  requiredFilled: number
  requiredTotal: number
}

/**
 * Элемент составного поля (связь composite_field → nested_field)
 */
export interface CompositeFieldItem {
  id: string
  composite_field_id: string
  nested_field_id: string
  order_index: number
  nested_field: FormField
}

export type FieldDefinitionSelectOption =
  Database['public']['Tables']['field_definition_select_options']['Row']
