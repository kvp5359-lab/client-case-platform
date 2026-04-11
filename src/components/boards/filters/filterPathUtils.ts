/**
 * Чистые утилиты для работы с древовидным path-массивом при редактировании
 * групп фильтров. Вынесено из FilterGroupEditor.tsx, чтобы главный компонент
 * не превышал 400 строк (аудит 2026-04-11, Зона 6).
 *
 * `RulePath` — массив индексов, ведущих от корня к конкретному правилу:
 *   `[0, 2, 1]` — в корневой группе 0-е правило (обязательно группа),
 *   внутри 2-е правило (тоже группа), внутри 1-е правило (любое).
 */

import type { FilterGroup, FilterRule } from '../types'

export type RulePath = number[]

/** Получить правило по path. Возвращает null, если path невалиден. */
export function getRuleByPath(group: FilterGroup, path: RulePath): FilterRule | null {
  if (path.length === 0) return null
  const [idx, ...rest] = path
  const rule = group.rules[idx]
  if (!rule) return null
  if (rest.length === 0) return rule
  if (rule.type === 'group') return getRuleByPath(rule.group, rest)
  return null
}

/**
 * Удалить правило по path, вернуть [новая группа, удалённое правило].
 * Удалённое правило нужно для операции перемещения (drag & drop).
 */
export function removeByPath(
  group: FilterGroup,
  path: RulePath,
): [FilterGroup, FilterRule | null] {
  if (path.length === 0) return [group, null]
  if (path.length === 1) {
    const idx = path[0]
    const removed = group.rules[idx] ?? null
    return [{ ...group, rules: group.rules.filter((_, i) => i !== idx) }, removed]
  }
  const [idx, ...rest] = path
  const rule = group.rules[idx]
  if (!rule || rule.type !== 'group') return [group, null]
  const [newSubGroup, removed] = removeByPath(rule.group, rest)
  const newRules = [...group.rules]
  newRules[idx] = { type: 'group', group: newSubGroup }
  return [{ ...group, rules: newRules }, removed]
}

/** Вставить правило в группу по groupPath, на позицию insertIdx. */
export function insertAtPosition(
  group: FilterGroup,
  groupPath: RulePath,
  insertIdx: number,
  rule: FilterRule,
): FilterGroup {
  if (groupPath.length === 0) {
    const newRules = [...group.rules]
    newRules.splice(insertIdx, 0, rule)
    return { ...group, rules: newRules }
  }
  const [idx, ...rest] = groupPath
  const target = group.rules[idx]
  if (!target || target.type !== 'group') return group
  const newSubGroup = insertAtPosition(target.group, rest, insertIdx, rule)
  const newRules = [...group.rules]
  newRules[idx] = { type: 'group', group: newSubGroup }
  return { ...group, rules: newRules }
}

/**
 * Корректирует target path после удаления элемента по removedPath.
 * Нужно при drag & drop: мы удаляем правило из исходной позиции,
 * но target path мог сдвинуться, если находится в той же родительской
 * группе и за удалённым индексом.
 */
export function adjustPathAfterRemoval(targetPath: RulePath, removedPath: RulePath): RulePath {
  if (removedPath.length === 0 || targetPath.length === 0) return targetPath
  const removedParent = removedPath.slice(0, -1)
  const removedIdx = removedPath[removedPath.length - 1]
  const adjusted = [...targetPath]
  if (removedParent.length <= targetPath.length) {
    const parentMatches = removedParent.every((v, i) => v === targetPath[i])
    if (parentMatches && removedParent.length < targetPath.length) {
      const levelIdx = removedParent.length
      if (adjusted[levelIdx] > removedIdx) {
        adjusted[levelIdx] = adjusted[levelIdx] - 1
      }
    }
  }
  return adjusted
}

/**
 * Корректирует insertIdx (позицию вставки внутри группы) после удаления.
 * Если удаляем из той же группы и перед целевым индексом — смещаем на -1.
 */
export function adjustIndexAfterRemoval(
  targetGroupPath: RulePath,
  targetIdx: number,
  removedPath: RulePath,
): number {
  const removedParent = removedPath.slice(0, -1)
  const removedIdx = removedPath[removedPath.length - 1]
  if (
    removedParent.length === targetGroupPath.length &&
    removedParent.every((v, i) => v === targetGroupPath[i]) &&
    removedIdx < targetIdx
  ) {
    return targetIdx - 1
  }
  return targetIdx
}

// ── Drag IDs ─────────────────────────────────────────────

/** Кодирует `RulePath` в стабильный id для dnd-kit. */
export function pathToId(prefix: string, path: RulePath): string {
  return `${prefix}:rule:${path.join('-')}`
}

/** Парсит id из dnd-kit обратно в `RulePath`. */
export function idToPath(
  prefix: string,
  id: string,
): { type: 'rule'; path: RulePath } | null {
  if (!id.startsWith(prefix + ':')) return null
  const rest = id.slice(prefix.length + 1)
  const ruleMatch = rest.match(/^rule:(.+)$/)
  if (ruleMatch) {
    return { type: 'rule', path: ruleMatch[1].split('-').map(Number) }
  }
  return null
}
