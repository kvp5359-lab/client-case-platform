/**
 * Типы для досок (планировщика).
 *
 * Чистые типы фильтра (FilterCondition, FilterGroup, FilterRule, FilterFieldDef,
 * FilterContext, OPERATOR_LABELS, SortField, SortDir, mergeFilterGroupsAnd,
 * EMPTY_FILTER_GROUP) переехали в `@/lib/filters/types` — переиспользуются
 * между board_lists и item_lists.
 */

import type { FilterGroup, SortField, SortDir } from '@/lib/filters/types'

// ── Сущности БД ─────────────────────────────────────────

export interface Board {
  id: string
  workspace_id: string
  name: string
  description: string | null
  access_type: 'workspace' | 'private' | 'custom'
  access_roles: string[]
  created_by: string | null
  sort_order: number
  /** Массив ширин колонок в px по индексу. Если длина меньше количества колонок — недостающие = DEFAULT_COLUMN_WIDTH */
  column_widths: number[]
  /** Фильтр на уровне всей доски (этап 4.1). Применяется AND к фильтру каждого
   *  списка соответствующего entity_type. Inbox-списки игнорируют. */
  global_filter: BoardGlobalFilter
  created_at: string
  updated_at: string
}

/**
 * Фильтр всей доски — отдельные группы для разных entity_type.
 * Inbox-списки имеют свою логику (default_filter), здесь не участвуют.
 */
export interface BoardGlobalFilter {
  project: FilterGroup
  thread: FilterGroup
}

/** Дефолтный пустой board.global_filter. */
export const EMPTY_BOARD_GLOBAL_FILTER: BoardGlobalFilter = {
  project: { logic: 'and', rules: [] },
  thread: { logic: 'and', rules: [] },
}

/** Безопасно достать BoardGlobalFilter из старых/кривых данных — заменяет
 *  отсутствующие поля дефолтными пустыми группами. */
export function normalizeBoardGlobalFilter(value: unknown): BoardGlobalFilter {
  const v = (value ?? {}) as Partial<BoardGlobalFilter>
  return {
    project: v.project ?? { logic: 'and', rules: [] },
    thread: v.thread ?? { logic: 'and', rules: [] },
  }
}

/** Дефолтная ширина колонки доски, если не задана */
export const DEFAULT_COLUMN_WIDTH = 340
/** Минимальная допустимая ширина колонки (чтобы UI не ломался) */
export const MIN_COLUMN_WIDTH = 200
/** Максимальная допустимая ширина колонки */
export const MAX_COLUMN_WIDTH = 800

export interface BoardMember {
  id: string
  board_id: string
  participant_id: string
  added_at: string
}

export type DisplayMode = 'list' | 'cards' | 'calendar'

/** Настройки календарного режима списка (board_lists.calendar_settings) */
export type CalendarDefaultView = 'day' | 'work_week' | 'week' | 'next_n'
export interface CalendarSettings {
  default_view: CalendarDefaultView
  /** Час начала рабочей сетки (0–23) */
  min_hour: number
  /** Час окончания рабочей сетки (1–24) */
  max_hour: number
  /** Количество дней для режима 'next_n'. Игнорируется в других режимах. */
  next_n_days?: number
  /** ID календарей нашей системы (`calendars.id`), события которых
   *  показывать в сетке вместе с задачами из фильтра. Пусто = только
   *  задачи (текущее legacy-поведение). */
  calendar_ids?: string[]
}
export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  default_view: 'week',
  min_hour: 8,
  max_hour: 21,
  next_n_days: 7,
}

/** Поля, которые можно показывать/скрывать в строке */
export type VisibleField = 'status' | 'deadline' | 'assignees' | 'project' | 'template'

/** Поле для группировки (none = без группировки) */
export type GroupByField = 'none' | 'status' | 'project' | 'assignee' | 'deadline'
export type ListHeight = 'auto' | 'medium' | 'full'

// ── Card Layout ─────────────────────────────────────────

/** ID поля карточки — объединение всех типов сущностей.
 *  Задачи: status, name, deadline, assignees, project, unread
 *  Проекты: icon, name, deadline, template */
export type CardFieldId =
  | 'status'
  | 'name'
  | 'deadline'
  | 'assignees'
  | 'project'
  | 'unread'
  | 'icon'
  | 'template'
  | 'next_task'
  | 'created_at'
  | 'created_by'
  | 'spacer'
  | 'menu'

export type CardFontSize = 'sm' | 'md' | 'lg'
export type CardAlign = 'left' | 'right'
export type CardTruncate = 'truncate' | 'wrap'

/** Стиль одного поля в карточке */
export interface CardFieldStyle {
  fontSize: CardFontSize
  align: CardAlign
  truncate: CardTruncate
  bold: boolean
}

/** Размещение поля в строке */
export interface CardFieldPlacement {
  fieldId: CardFieldId
  visible: boolean
  style: CardFieldStyle
}

/** Строка карточки (макс. 3) */
export interface CardLayoutRow {
  id: string
  fields: CardFieldPlacement[]
}

/** Полный layout карточки, хранится в board_lists.card_layout JSONB */
export interface CardLayout {
  version: 1
  rows: CardLayoutRow[]
}

export interface BoardList {
  id: string
  board_id: string
  name: string
  entity_type: 'thread' | 'project' | 'inbox'
  column_index: number
  sort_order: number
  filters: FilterGroup
  sort_by: SortField
  sort_dir: SortDir
  display_mode: DisplayMode
  visible_fields: VisibleField[]
  group_by: GroupByField
  list_height: ListHeight
  header_color: string | null
  card_layout: CardLayout | null
  calendar_settings: CalendarSettings | null
  created_at: string
  updated_at: string
}

/** Предустановленные цвета для шапки списка (как в Notion) */
export const HEADER_COLORS = [
  { value: 'gray', label: 'Серый', bg: 'bg-gray-100', text: 'text-gray-700', dot: '#6B7280' },
  { value: 'brown', label: 'Коричневый', bg: 'bg-amber-50', text: 'text-amber-800', dot: '#92400E' },
  { value: 'orange', label: 'Оранжевый', bg: 'bg-orange-100', text: 'text-orange-700', dot: '#C2410C' },
  { value: 'yellow', label: 'Жёлтый', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: '#A16207' },
  { value: 'green', label: 'Зелёный', bg: 'bg-green-100', text: 'text-green-700', dot: '#15803D' },
  { value: 'blue', label: 'Синий', bg: 'bg-blue-100', text: 'text-blue-700', dot: '#1D4ED8' },
  { value: 'purple', label: 'Фиолетовый', bg: 'bg-purple-100', text: 'text-purple-700', dot: '#7E22CE' },
  { value: 'pink', label: 'Розовый', bg: 'bg-pink-100', text: 'text-pink-700', dot: '#BE185D' },
  { value: 'red', label: 'Красный', bg: 'bg-red-100', text: 'text-red-700', dot: '#B91C1C' },
] as const

export type HeaderColorValue = (typeof HEADER_COLORS)[number]['value']

export function getHeaderColor(value: string | null) {
  return HEADER_COLORS.find((c) => c.value === value) ?? HEADER_COLORS[0]
}

/** Преобразует hex-цвет в светлый фон + тёмный текст для шапки */
export function hexToHeaderStyle(color: string | null): { bg: string; text: string } {
  if (!color) return { bg: '#F3F4F6', text: '#374151' }

  // Если это preset-значение (gray, blue, ...) — используем маппинг
  const preset = HEADER_COLORS.find((c) => c.value === color)
  if (preset) return { bg: preset.dot + '20', text: preset.dot }

  // Произвольный hex — светлый фон (20% opacity), тёмный текст
  return { bg: color + '20', text: color }
}
