/**
 * Типы для пользовательских справочников
 */

import type { Database } from './database'

// --- Row types ---
export type CustomDirectory = Database['public']['Tables']['custom_directories']['Row']
export type CustomDirectoryField = Database['public']['Tables']['custom_directory_fields']['Row']
export type CustomDirectoryEntry = Database['public']['Tables']['custom_directory_entries']['Row']
export type CustomDirectoryValue = Database['public']['Tables']['custom_directory_values']['Row']

// --- Insert types ---
export type CustomDirectoryInsert = Database['public']['Tables']['custom_directories']['Insert']
export type CustomDirectoryFieldInsert =
  Database['public']['Tables']['custom_directory_fields']['Insert']
export type CustomDirectoryEntryInsert =
  Database['public']['Tables']['custom_directory_entries']['Insert']
export type CustomDirectoryValueInsert =
  Database['public']['Tables']['custom_directory_values']['Insert']

// --- Update types ---
export type CustomDirectoryUpdate = Database['public']['Tables']['custom_directories']['Update']
export type CustomDirectoryFieldUpdate =
  Database['public']['Tables']['custom_directory_fields']['Update']

// --- Enum ---
export type CustomDirectoryFieldType = Database['public']['Enums']['custom_directory_field_type']

// --- Field options ---
export interface DirectoryFieldOptions {
  /** Варианты для select / multi_select */
  choices?: string[]
  /** ID справочника для directory_ref */
  ref_directory_id?: string
  /** Placeholder */
  placeholder?: string
}

// --- Запись с загруженными значениями ---
export interface DirectoryEntryWithValues extends CustomDirectoryEntry {
  values: Record<string, CustomDirectoryValue>
}

// --- Маппинг типов полей к человекочитаемым названиям ---
export const FIELD_TYPE_LABELS: Record<CustomDirectoryFieldType, string> = {
  text: 'Текст',
  textarea: 'Многострочный текст',
  number: 'Число',
  date: 'Дата',
  checkbox: 'Да/Нет',
  select: 'Выпадающий список',
  multi_select: 'Множественный выбор',
  directory_ref: 'Ссылка на справочник',
  email: 'Email',
  phone: 'Телефон',
  url: 'Ссылка',
}

// --- Иконки для типов полей ---
export const FIELD_TYPE_ICONS: Record<CustomDirectoryFieldType, string> = {
  text: 'Type',
  textarea: 'AlignLeft',
  number: 'Hash',
  date: 'Calendar',
  checkbox: 'CheckSquare',
  select: 'ChevronDown',
  multi_select: 'List',
  directory_ref: 'Link',
  email: 'Mail',
  phone: 'Phone',
  url: 'Globe',
}

export const DIRECTORY_PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6B7280', // gray
]
