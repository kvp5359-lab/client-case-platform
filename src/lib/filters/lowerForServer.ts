/**
 * Подготовка фильтра к серверной фильтрации досок (вариант A — union-prefilter).
 *
 * Серверный компилятор (миграция 20260611_board_server_side_filter.sql) НЕ
 * понимает динамические значения `__me__` — поэтому их разворачивает клиент в
 * конкретные id. Всё, что развернуть нельзя (нет id), заменяется на «noop»-
 * условие, которое сервер компилирует в `true` (надмножество — безопасно и в
 * AND, и в OR). Даты, `__creator__`, `__no_status__` НЕ трогаем: сервер сам
 * обрабатывает `__no_status__`, а даты/`__creator__` игнорирует (→ `true`), и
 * клиентский движок дорезает их точно.
 *
 * Принцип всей серверной фильтрации: сервер сужает ГРУБО (с запасом), клиент
 * фильтрует ТОЧНО. Поэтому здесь любая неопределённость → в сторону «вернуть
 * больше», никогда «потерять строку».
 */

import { EMPTY_FILTER_GROUP, mergeFilterGroupsAnd, mergeFilterGroupsOr } from './types'
import type { FilterGroup, FilterRule, FilterCondition } from './types'

const ME = '__me__'

/** Условие-заглушка: сервер не знает поле `__noop__` → компилирует в `true`. */
const NOOP_CONDITION: FilterCondition = {
  type: 'condition',
  field: '__noop__',
  operator: 'is_not_null',
  value: null,
}

export type ServerFilterIds = {
  currentParticipantId: string | null
  currentUserId: string | null
}

/** Чем разворачивается `__me__` для конкретного поля. */
function resolveMeForField(field: string, ids: ServerFilterIds): string | null {
  if (field === 'assignees' || field === 'participants') return ids.currentParticipantId
  // created_by и прочие пользовательские поля используют user_id.
  return ids.currentUserId
}

/** Развернуть `__me__` в значении условия. `null` если что-то не разрешилось. */
function lowerValue(value: unknown, field: string, ids: ServerFilterIds): unknown | null {
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const v of value) {
      if (v === ME) {
        const resolved = resolveMeForField(field, ids)
        if (resolved == null) return null
        out.push(resolved)
      } else {
        out.push(v)
      }
    }
    return out
  }
  if (value === ME) {
    const resolved = resolveMeForField(field, ids)
    return resolved == null ? null : resolved
  }
  return value
}

function lowerRule(rule: FilterRule, ids: ServerFilterIds): FilterRule {
  if (rule.type === 'group') {
    return { type: 'group', group: lowerFilterForServer(rule.group, ids) }
  }
  const lowered = lowerValue(rule.value, rule.field, ids)
  // Не смогли развернуть __me__ → нейтрализуем условие в `true` (надмножество).
  if (lowered === null && containsMe(rule.value)) return NOOP_CONDITION
  if (lowered === rule.value) return rule
  return { ...rule, value: lowered }
}

function containsMe(value: unknown): boolean {
  if (Array.isArray(value)) return value.includes(ME)
  return value === ME
}

/**
 * Развернуть `__me__` во всём дереве фильтра. Структура (AND/OR, вложенность)
 * сохраняется — меняются только значения.
 */
export function lowerFilterForServer(group: FilterGroup, ids: ServerFilterIds): FilterGroup {
  if (!group || group.rules.length === 0) return group ?? EMPTY_FILTER_GROUP
  return {
    logic: group.logic,
    rules: group.rules.map((r) => lowerRule(r, ids)),
  }
}

/** Срез board-level фильтра для нужного entity_type. */
export type BoardFilterSlices = {
  thread?: FilterGroup
  project?: FilterGroup
}

/** Минимум полей списка, нужных для сборки серверного фильтра. */
export type BoardListFilterInput = {
  entity_type: 'thread' | 'project' | 'inbox'
  filters: FilterGroup
}

/**
 * Собрать серверный union-фильтр для досок по нужному entity_type.
 *
 * Для каждого списка нужного типа берём его фильтр, накладываем board-level
 * срез через AND (как в UI), затем объединяем все списки через OR и
 * разворачиваем `__me__`. Если хоть один список без фильтра — union вырождается
 * в пустую группу (= сервер ничего не сужает, грузим всё; клиент дорежет).
 */
export function buildBoardServerFilter(
  lists: BoardListFilterInput[],
  boardGlobalFilter: BoardFilterSlices | undefined,
  entityType: 'thread' | 'project',
  ids: ServerFilterIds,
): FilterGroup {
  const slice = boardGlobalFilter?.[entityType]
  const perList: FilterGroup[] = []
  for (const list of lists) {
    if (list.entity_type !== entityType) continue
    const listFilter = list.filters ?? EMPTY_FILTER_GROUP
    perList.push(slice ? mergeFilterGroupsAnd(slice, listFilter) : listFilter)
  }
  if (perList.length === 0) return EMPTY_FILTER_GROUP
  const union = mergeFilterGroupsOr(perList)
  return lowerFilterForServer(union, ids)
}
