/**
 * Утилиты для cross-list DnD карточек на доске (этап 4.5 CRM-фрейма).
 *
 * Главная задача — резолвить «куда падает карточка». Если drop был на список
 * с фильтром `status_id IN [X]`, то X становится новым статусом карточки.
 */

import type { FilterCondition, FilterGroup, FilterRule } from '@/lib/filters/types'

/**
 * Извлекает целевой status_id из фильтра списка. Работает только для простых
 * случаев: фильтр AND-группа на верхнем уровне, среди rules есть условие
 * `status_id` с оператором 'in' / 'equals' и одним значением (или единственным
 * значением в массиве). Иначе вернёт null — drop в такой список не меняет
 * статус.
 *
 * Намеренно не делаем умного поиска по вложенным группам — авто-канбан
 * генерит чёткую плоскую структуру, в неё мы и попадаем.
 */
export function extractStatusIdFromFilter(filter: FilterGroup | null | undefined): string | null {
  if (!filter || filter.logic !== 'and') return null
  for (const rule of filter.rules) {
    if (rule.type !== 'condition') continue
    const cond = rule as FilterCondition
    if (cond.field !== 'status_id') continue
    if (cond.operator === 'equals') {
      if (typeof cond.value === 'string') return cond.value
      if (Array.isArray(cond.value) && cond.value.length === 1 && typeof cond.value[0] === 'string') {
        return cond.value[0]
      }
    }
    if (cond.operator === 'in') {
      if (Array.isArray(cond.value) && cond.value.length === 1 && typeof cond.value[0] === 'string') {
        return cond.value[0]
      }
    }
  }
  return null
}

/** Помогает понять, тот же ли это статус (учитывая что null/__no_status__ — это тоже валидное значение). */
export function statusEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

// Pure helper, экспорт для тестов.
export const _internal = { rule: undefined as unknown as FilterRule }
