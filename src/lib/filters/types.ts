/**
 * Общие типы для фильтров.
 *
 * Используется и досками (board_lists.filters), и списками (item_lists.filter_config).
 */

// ── Дерево фильтра ──────────────────────────────────────────

/** Одно условие фильтра */
export type FilterCondition = {
  type: 'condition'
  field: string
  operator: string
  value: unknown
}

/** Группа условий (AND / OR), может содержать вложенные группы */
export type FilterGroup = {
  logic: 'and' | 'or'
  rules: FilterRule[]
}

/** Правило: либо условие, либо вложенная группа */
export type FilterRule =
  | FilterCondition
  | { type: 'group'; group: FilterGroup }

/** Пустая группа фильтров */
export const EMPTY_FILTER_GROUP: FilterGroup = { logic: 'and', rules: [] }

/** Объединить две группы фильтров через AND. Пустая группа возвращает другую — без лишних обёрток. */
export function mergeFilterGroupsAnd(a: FilterGroup, b: FilterGroup): FilterGroup {
  if (!a || a.rules.length === 0) return b
  if (!b || b.rules.length === 0) return a
  return {
    logic: 'and',
    rules: [
      { type: 'group', group: a },
      { type: 'group', group: b },
    ],
  }
}

/**
 * Объединить несколько групп фильтров через OR (union).
 *
 * Используется серверной фильтрацией досок: каждый список доски даёт свою
 * группу, серверу отправляется их OR — «верни всё, что подходит хоть одному
 * списку». Пустая группа среди слагаемых означает «список без фильтра = всё»,
 * поэтому весь union вырождается в пустую группу (= не сужать ничего).
 */
export function mergeFilterGroupsOr(groups: FilterGroup[]): FilterGroup {
  const nonTrivial: FilterGroup[] = []
  for (const g of groups) {
    // Список без правил = «показывать всё» → union тоже «всё».
    if (!g || g.rules.length === 0) return EMPTY_FILTER_GROUP
    nonTrivial.push(g)
  }
  if (nonTrivial.length === 0) return EMPTY_FILTER_GROUP
  if (nonTrivial.length === 1) return nonTrivial[0]
  return {
    logic: 'or',
    rules: nonTrivial.map((g) => ({ type: 'group' as const, group: g })),
  }
}

// ── Описание полей фильтра ─────────────────────────────────

export type FieldType = 'uuid' | 'date' | 'boolean' | 'text' | 'junction'

/**
 * Описание одного поля, по которому можно фильтровать.
 *
 * `applicableTypes` — для `entity_type='thread'` ограничивает применимость к
 * типам тредов (task/chat/email). Если не задано — поле применимо ко всем.
 * Для `project` это поле не используется.
 */
export type FilterFieldDef = {
  key: string
  label: string
  type: FieldType
  operators: string[]
  /** Показывать опцию «Я» в выборе значения */
  supportsMe?: boolean
  /** Название junction-таблицы */
  junctionTable?: string
  /** Применимость к типам треда (task/chat/email). Только для entity_type='thread'. */
  applicableTypes?: ThreadType[]
}

/** Тип треда — для фильтра по полю `type` и для applicableTypes в FilterFieldDef. */
export type ThreadType = 'task' | 'chat' | 'email'

// ── Контекст фильтрации ─────────────────────────────────────

export type FilterContext = {
  currentParticipantId: string | null
  currentUserId: string | null
  now: Date
  /** Маппинг user_id → participant_id (для резолва __creator__ в junction-фильтрах) */
  userToParticipantMap?: Record<string, string>
}

// ── Операторы ───────────────────────────────────────────────

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

// ── Сортировка ──────────────────────────────────────────────

export type SortField =
  | 'created_at'
  | 'updated_at'
  | 'deadline'
  | 'status_order'
  | 'name'
  | 'manual_order'
  | 'next_task_deadline'
  | 'last_message_at'
export type SortDir = 'asc' | 'desc'
