/**
 * Типы для FormTemplateEditorPage
 */

import { Database } from '@/types/database'
import type { FieldDefinition } from '@/types/formKit'

// Базовые типы из БД
export type FormTemplate = Database['public']['Tables']['form_templates']['Row']
export type FormTemplateSection = Database['public']['Tables']['form_template_sections']['Row']
export type { FieldDefinition }
export type FormTemplateField = Database['public']['Tables']['form_template_fields']['Row']

// Секция с подсчётом полей (name и description теперь прямо в FormTemplateSection)
export type FormSectionWithDetails = {
  fields_count: number
} & FormTemplateSection

// Поле формы с данными об определении поля
export type FormFieldWithDefinition = {
  field_definition: FieldDefinition
  options: Record<string, unknown> | null
  description?: string | null // Может приходить из join
} & Omit<
  FormTemplateField,
  'options' | 'description'
>

// Props для DraggableFieldRow
export type DraggableFieldRowProps = {
  field: FormFieldWithDefinition
  index?: number
  isDragging: boolean
  isOver: boolean
  overPosition: 'top' | 'bottom'
  onDragStart: (e: React.DragEvent, fieldId: string) => void
  onDragOver: (e: React.DragEvent, fieldId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, field: FormFieldWithDefinition) => void
  onDragEnd: () => void
  onEdit: (field: FormFieldWithDefinition) => void
  onRemove: (fieldId: string) => void
}

// Утилита для получения типа поля на русском
export const getFieldTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    text: 'Текст',
    number: 'Число',
    date: 'Дата',
    checkbox: 'Чекбокс',
    select: 'Список значений',
    email: 'Email',
    phone: 'Телефон',
    textarea: 'Текстовая область',
    url: 'URL',
    composite: 'Составное поле',
    'key-value-table': 'Таблица ключ-значение',
    divider: 'Разделитель',
  }
  return labels[type] || type
}
