/**
 * Движок фильтрации для досок.
 *
 * Чистая функция — принимает данные и фильтры, возвращает отфильтрованный массив.
 * Поддерживает рекурсивные AND/OR группы и относительного пользователя (__me__).
 */

import type { FilterGroup, FilterRule, FilterCondition, FilterContext } from '../types'

const ME = '__me__'
const CREATOR = '__creator__'

// ── Вспомогательные функции для дат ─────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Понедельник
  const start = new Date(d)
  start.setDate(d.getDate() + diff)
  return startOfDay(start)
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return endOfDay(end)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** Парсит динамический пресет __last_n_days:7__ → { type, n } */
function parseDynamicPreset(preset: string): { type: string; n: number } | null {
  const m = preset.match(/^__(\w+):(\d+)__$/)
  if (!m) return null
  return { type: m[1], n: parseInt(m[2], 10) }
}

/** Резолвит относительный пресет (__today__, __last_n_days:7__, ...) в диапазон [start, end] */
function resolvePresetRange(preset: string, now: Date): [Date, Date] | null {
  // Динамические пресеты: __last_n_days:N__, __next_n_days:N__
  const dyn = parseDynamicPreset(preset)
  if (dyn) {
    if (dyn.type === 'last_n_days') {
      const s = new Date(now); s.setDate(s.getDate() - dyn.n)
      return [startOfDay(s), endOfDay(now)]
    }
    if (dyn.type === 'next_n_days') {
      const e = new Date(now); e.setDate(e.getDate() + dyn.n)
      return [startOfDay(now), endOfDay(e)]
    }
    return null
  }

  switch (preset) {
    case '__today__':
      return [startOfDay(now), endOfDay(now)]
    case '__yesterday__': {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      return [startOfDay(d), endOfDay(d)]
    }
    case '__tomorrow__': {
      const d = new Date(now); d.setDate(d.getDate() + 1)
      return [startOfDay(d), endOfDay(d)]
    }
    case '__this_week__':
      return [startOfWeek(now), endOfWeek(now)]
    case '__last_week__': {
      const d = new Date(now); d.setDate(d.getDate() - 7)
      return [startOfWeek(d), endOfWeek(d)]
    }
    case '__next_week__': {
      const d = new Date(now); d.setDate(d.getDate() + 7)
      return [startOfWeek(d), endOfWeek(d)]
    }
    case '__this_month__':
      return [startOfMonth(now), endOfMonth(now)]
    case '__last_month__': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return [startOfMonth(d), endOfMonth(d)]
    }
    case '__next_month__': {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return [startOfMonth(d), endOfMonth(d)]
    }
    default:
      return null
  }
}

function isPreset(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('__') && v.endsWith('__')
}

/** Резолвит значение фильтра даты: пресет → конкретная дата, ISO строка → Date */
function resolveDateValue(v: unknown, now: Date): Date | null {
  if (!v) return null
  if (isPreset(v)) {
    const range = resolvePresetRange(v as string, now)
    // Для скалярных операторов (<, >, =) используем start диапазона
    return range ? range[0] : null
  }
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

function resolveDateRange(v: unknown, now: Date): [Date, Date] | null {
  if (!v) return null
  if (isPreset(v)) return resolvePresetRange(v as string, now)
  const d = new Date(v as string)
  if (isNaN(d.getTime())) return null
  return [startOfDay(d), endOfDay(d)]
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

// ── Разрешение __me__ ───────────────────────────────────

function resolveValue(val: unknown, field: string, ctx: FilterContext, item?: unknown): unknown {
  if (val === ME) {
    // junction-поля (assignees, participants) используют participant_id
    if (field === 'assignees' || field === 'participants') {
      return ctx.currentParticipantId
    }
    // created_by использует user_id
    return ctx.currentUserId
  }
  if (val === CREATOR && item) {
    // __creator__: резолвим в participant_id постановщика задачи
    const createdBy = (item as { created_by?: string | null }).created_by
    if (!createdBy || !ctx.userToParticipantMap) return null
    return ctx.userToParticipantMap[createdBy] ?? null
  }
  return val
}

function resolveArray(arr: unknown, field: string, ctx: FilterContext, item?: unknown): unknown[] {
  // Защита от данных, сохранённых до миграции на multi-select: value мог быть
  // строкой/null. Приводим к массиву и пропускаем пустые значения.
  const list: unknown[] = Array.isArray(arr) ? arr : arr == null || arr === '' ? [] : [arr]
  return list.map((v) => resolveValue(v, field, ctx, item))
}

// ── Оценка одного условия ───────────────────────────────

type FieldAccessor = (item: unknown) => unknown
type JunctionAccessor = (itemId: string) => string[]

function evaluateCondition(
  condition: FilterCondition,
  item: unknown,
  ctx: FilterContext,
  fieldAccessors: Record<string, FieldAccessor>,
  junctionAccessors: Record<string, JunctionAccessor>,
): boolean {
  const { field, operator, value } = condition

  // Junction-поля: assignees, participants
  if (junctionAccessors[field]) {
    const itemId = (item as { id: string }).id
    const relatedIds = junctionAccessors[field](itemId)

    switch (operator) {
      case 'equals': {
        const vals = Array.isArray(value)
          ? resolveArray(value, field, ctx, item)
          : [resolveValue(value, field, ctx, item)]
        return relatedIds.some((id) => vals.includes(id))
      }
      case 'in': {
        const vals = resolveArray(value as unknown[], field, ctx, item)
        return relatedIds.some((id) => vals.includes(id))
      }
      case 'not_equals': {
        const vals = Array.isArray(value)
          ? resolveArray(value, field, ctx, item)
          : [resolveValue(value, field, ctx, item)]
        return !relatedIds.some((id) => vals.includes(id))
      }
      case 'not_in': {
        const vals = resolveArray(value as unknown[], field, ctx, item)
        return !relatedIds.some((id) => vals.includes(id))
      }
      case 'is_null':
        return relatedIds.length === 0
      case 'is_not_null':
        return relatedIds.length > 0
      default:
        return true
    }
  }

  // Обычные поля
  const accessor = fieldAccessors[field]
  if (!accessor) return true // неизвестное поле — пропускаем

  const actual = accessor(item)

  switch (operator) {
    case 'equals': {
      // Если value — массив (мультиселект), работаем как 'in'
      if (Array.isArray(value)) {
        const vals = resolveArray(value, field, ctx)
        if (actual == null && vals.includes('__no_status__')) return true
        return vals.includes(actual)
      }
      const resolved = resolveValue(value, field, ctx)
      if (actual == null && resolved === '__no_status__') return true
      return actual === resolved
    }
    case 'not_equals': {
      const resolved = resolveValue(value, field, ctx)
      return actual !== resolved
    }
    case 'in': {
      const vals = resolveArray(value as unknown[], field, ctx)
      // __no_status__ → совпадает с null
      if (actual == null && vals.includes('__no_status__')) return true
      return vals.includes(actual)
    }
    case 'not_in': {
      const vals = resolveArray(value as unknown[], field, ctx)
      if (actual == null && vals.includes('__no_status__')) return false
      return !vals.includes(actual)
    }
    case 'is_null':
      return actual == null
    case 'is_not_null':
      return actual != null
    case 'contains':
      return (
        typeof actual === 'string' &&
        actual.toLowerCase().includes(String(value).toLowerCase())
      )

    // Даты — с поддержкой пресетов (__today__, __this_week__, ...)
    case 'before': {
      const d = parseDate(actual)
      if (!d) return false
      const range = resolveDateRange(value, ctx.now)
      return range ? d < range[0] : d < (resolveDateValue(value, ctx.now) ?? d)
    }
    case 'before_eq': {
      const d = parseDate(actual)
      if (!d) return false
      const range = resolveDateRange(value, ctx.now)
      return range ? d <= range[1] : d <= (resolveDateValue(value, ctx.now) ?? d)
    }
    case 'after': {
      const d = parseDate(actual)
      if (!d) return false
      const range = resolveDateRange(value, ctx.now)
      return range ? d > range[1] : d > (resolveDateValue(value, ctx.now) ?? d)
    }
    case 'after_eq': {
      const d = parseDate(actual)
      if (!d) return false
      const range = resolveDateRange(value, ctx.now)
      return range ? d >= range[0] : d >= (resolveDateValue(value, ctx.now) ?? d)
    }
    case 'date_eq': {
      const d = parseDate(actual)
      if (!d) return false
      const range = resolveDateRange(value, ctx.now)
      return range ? d >= range[0] && d <= range[1] : false
    }
    case 'between': {
      const d = parseDate(actual)
      if (!d) return false
      const arr = value as [unknown, unknown]
      const fromRange = resolveDateRange(arr[0], ctx.now)
      const toRange = resolveDateRange(arr[1], ctx.now)
      const dFrom = fromRange ? fromRange[0] : resolveDateValue(arr[0], ctx.now)
      const dTo = toRange ? toRange[1] : resolveDateValue(arr[1], ctx.now)
      return dFrom != null && dTo != null && d >= dFrom && d <= dTo
    }
    case 'today': {
      const d = parseDate(actual)
      if (!d) return false
      return d >= startOfDay(ctx.now) && d <= endOfDay(ctx.now)
    }
    case 'this_week': {
      const d = parseDate(actual)
      if (!d) return false
      return d >= startOfWeek(ctx.now) && d <= endOfWeek(ctx.now)
    }
    case 'overdue': {
      const d = parseDate(actual)
      return d != null && d < startOfDay(ctx.now)
    }

    default:
      return true
  }
}

// ── Рекурсивная оценка группы ───────────────────────────

function evaluateRule(
  rule: FilterRule,
  item: unknown,
  ctx: FilterContext,
  fieldAccessors: Record<string, FieldAccessor>,
  junctionAccessors: Record<string, JunctionAccessor>,
): boolean {
  if (rule.type === 'condition') {
    return evaluateCondition(rule, item, ctx, fieldAccessors, junctionAccessors)
  }
  // type === 'group'
  return evaluateGroup(rule.group, item, ctx, fieldAccessors, junctionAccessors)
}

function evaluateGroup(
  group: FilterGroup,
  item: unknown,
  ctx: FilterContext,
  fieldAccessors: Record<string, FieldAccessor>,
  junctionAccessors: Record<string, JunctionAccessor>,
): boolean {
  if (group.rules.length === 0) return true

  if (group.logic === 'and') {
    return group.rules.every((r) =>
      evaluateRule(r, item, ctx, fieldAccessors, junctionAccessors),
    )
  }
  // 'or'
  return group.rules.some((r) =>
    evaluateRule(r, item, ctx, fieldAccessors, junctionAccessors),
  )
}

// ── Публичная функция ───────────────────────────────────

/**
 * Применяет фильтры к массиву элементов.
 *
 * @param items — исходный массив (задачи или проекты)
 * @param filters — дерево фильтров (FilterGroup)
 * @param ctx — контекст: текущий пользователь, текущая дата
 * @param fieldAccessors — геттеры полей: { status_id: (item) => item.status_id }
 * @param junctionAccessors — геттеры junction: { assignees: (id) => ['pid1', 'pid2'] }
 */
export function applyFilters<T>(
  items: T[],
  filters: FilterGroup,
  ctx: FilterContext,
  fieldAccessors: Record<string, FieldAccessor>,
  junctionAccessors: Record<string, JunctionAccessor> = {},
): T[] {
  if (filters.rules.length === 0) return items
  return items.filter((item) =>
    evaluateGroup(filters, item, ctx, fieldAccessors, junctionAccessors),
  )
}
