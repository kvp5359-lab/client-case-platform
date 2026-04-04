/**
 * Константы для FieldDefinitionDialog
 */

import {
  Type,
  FileText,
  Hash,
  Calendar,
  Mail,
  Phone,
  Link,
  CheckSquare,
  List,
  Layers,
  Minus,
  Table,
} from 'lucide-react'
import type { FieldType } from '@/components/forms/types'

// Маппинг типов полей с иконками
export const FIELD_TYPES: Array<{ value: FieldType; label: string; icon: React.ReactNode }> = [
  { value: 'text', label: 'Текст', icon: <Type className="w-4 h-4" /> },
  { value: 'textarea', label: 'Многострочный текст', icon: <FileText className="w-4 h-4" /> },
  { value: 'number', label: 'Число', icon: <Hash className="w-4 h-4" /> },
  { value: 'date', label: 'Дата', icon: <Calendar className="w-4 h-4" /> },
  { value: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { value: 'phone', label: 'Телефон', icon: <Phone className="w-4 h-4" /> },
  { value: 'url', label: 'URL ссылка', icon: <Link className="w-4 h-4" /> },
  { value: 'checkbox', label: 'Чекбокс', icon: <CheckSquare className="w-4 h-4" /> },
  { value: 'select', label: 'Список значений', icon: <List className="w-4 h-4" /> },
  { value: 'composite', label: 'Составное поле', icon: <Layers className="w-4 h-4" /> },
  { value: 'key-value-table', label: 'Таблица', icon: <Table className="w-4 h-4" /> },
  { value: 'divider', label: 'Разделитель', icon: <Minus className="w-4 h-4" /> },
]

// Маппинг типов полей на русский язык
export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Текст',
  textarea: 'Многострочный текст',
  number: 'Число',
  date: 'Дата',
  email: 'Email',
  phone: 'Телефон',
  url: 'URL',
  checkbox: 'Чекбокс',
  select: 'Список значений',
  composite: 'Составное поле',
  'key-value-table': 'Таблица',
  divider: 'Разделитель',
}

// Типы колонок для таблицы
export const COLUMN_TYPES = [
  { value: 'text', label: 'Текст' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Телефон' },
]

// Типы
export interface TableColumn {
  name: string
  type: string
  width?: number
}

export interface ValidationConfig {
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
}

export const DEFAULT_TABLE_COLUMNS: TableColumn[] = [
  { name: 'Название', type: 'text', width: 50 },
  { name: 'Значение', type: 'text', width: 50 },
]
