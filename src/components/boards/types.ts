/**
 * Типы для досок (планировщика).
 */

// ── Фильтры ──────────────────────────────────────────────

/** Одно условие фильтра */
export interface FilterCondition {
  type: 'condition'
  field: string
  operator: string
  value: unknown
}

/** Группа условий (AND / OR), может содержать вложенные группы */
export interface FilterGroup {
  logic: 'and' | 'or'
  rules: FilterRule[]
}

/** Правило: либо условие, либо вложенная группа */
export type FilterRule =
  | FilterCondition
  | { type: 'group'; group: FilterGroup }

/** Пустая группа фильтров */
export const EMPTY_FILTER_GROUP: FilterGroup = { logic: 'and', rules: [] }

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
  created_at: string
  updated_at: string
}

export interface BoardMember {
  id: string
  board_id: string
  participant_id: string
  added_at: string
}

export type SortField = 'created_at' | 'updated_at' | 'deadline' | 'status_order' | 'name'
export type SortDir = 'asc' | 'desc'
export type DisplayMode = 'list' | 'cards'

/** Поля, которые можно показывать/скрывать в строке задачи */
export type VisibleField = 'status' | 'deadline' | 'assignees' | 'project'

/** Поле для группировки (none = без группировки) */
export type GroupByField = 'none' | 'status' | 'project' | 'assignee' | 'deadline'

export interface BoardList {
  id: string
  board_id: string
  name: string
  entity_type: 'task' | 'project'
  column_index: number
  sort_order: number
  filters: FilterGroup
  sort_by: SortField
  sort_dir: SortDir
  display_mode: DisplayMode
  visible_fields: VisibleField[]
  group_by: GroupByField
  created_at: string
  updated_at: string
}

// ── Определения полей для фильтров ──────────────────────

export type FieldType = 'uuid' | 'date' | 'boolean' | 'text' | 'junction'

export interface FilterFieldDef {
  key: string
  label: string
  type: FieldType
  operators: string[]
  /** Показывать опцию «Я» в выборе значения */
  supportsMe?: boolean
  /** Название junction-таблицы */
  junctionTable?: string
}

// ── Контекст фильтрации ─────────────────────────────────

export interface FilterContext {
  currentParticipantId: string | null
  currentUserId: string | null
  now: Date
  /** Маппинг user_id → participant_id (для резолва __creator__ в junction-фильтрах) */
  userToParticipantMap?: Record<string, string>
}

// ── Операторы ────────────────────────────────────────────

export const OPERATOR_LABELS: Record<string, string> = {
  equals: '=',
  not_equals: '≠',
  in: 'содержит',
  not_in: 'не содержит',
  is_null: 'пусто',
  is_not_null: 'не пусто',
  before: '<',
  before_eq: '≤',
  after: '>',
  after_eq: '≥',
  date_eq: '=',
  between: 'между',
  today: 'сегодня',
  this_week: 'эта неделя',
  overdue: 'просрочено',
  contains: 'содержит текст',
}
