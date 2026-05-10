/**
 * Умная фильтрация полей при выборе типа треда.
 *
 * Когда пользователь добавляет в фильтр условие `type IN [...]` или `type = X`,
 * UI скрывает поля, неприменимые к выбранным типам тредов. Например, при
 * `type IN [chat, email]` — скрывает status_id, deadline, assignees (есть
 * только у task), и оставляет last_message_at, unread, channel.
 *
 * Анализируем только rules[] на верхнем уровне корневой группы — это покрывает
 * 99% реальных случаев и не требует от пользователя думать про вложенность.
 */

import type { FilterFieldDef, FilterGroup, ThreadType } from './types'

const THREAD_TYPES: ThreadType[] = ['task', 'chat', 'email']

/**
 * Возвращает массив типов тредов, к которым явно ограничен фильтр через
 * условие на поле `type`. Если ограничения нет — `null` (показывать все
 * поля без сужения).
 */
export function getApplicableThreadTypes(group: FilterGroup): ThreadType[] | null {
  for (const rule of group.rules) {
    if (rule.type !== 'condition') continue
    if (rule.field !== 'type') continue

    if (rule.operator === 'equals' && typeof rule.value === 'string') {
      const v = rule.value as ThreadType
      if (THREAD_TYPES.includes(v)) return [v]
    }
    if (rule.operator === 'in' && Array.isArray(rule.value)) {
      const vs = rule.value.filter((v): v is ThreadType =>
        typeof v === 'string' && THREAD_TYPES.includes(v as ThreadType),
      )
      if (vs.length > 0) return vs
    }
    if (rule.operator === 'not_in' && Array.isArray(rule.value)) {
      const excluded = new Set(rule.value)
      const allowed = THREAD_TYPES.filter((t) => !excluded.has(t))
      if (allowed.length > 0 && allowed.length < THREAD_TYPES.length) return allowed
    }
  }
  return null
}

/**
 * Оставляет только те поля, которые применимы хотя бы к одному из выбранных
 * типов тредов. Если `types === null` — возвращает все поля.
 *
 * Поля без `applicableTypes` (например, у проектных фильтров) не сужаются.
 */
export function filterFieldsByThreadTypes(
  fields: FilterFieldDef[],
  types: ThreadType[] | null,
): FilterFieldDef[] {
  if (!types || types.length === 0) return fields
  return fields.filter((f) => {
    if (!f.applicableTypes) return true
    return f.applicableTypes.some((t) => types.includes(t))
  })
}
