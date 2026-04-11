/**
 * Юнит-тесты для path-утилит редактора фильтров досок.
 *
 * Эти функции — критически важные для drag & drop в `FilterGroupEditor`.
 * Тесты добавлены в рамках П4.7 третьего аудита (2026-04-11) — функции
 * существовали в проде и работали, но без покрытия любая регрессия в этом
 * файле тихо ломала бы D&D на вложенных группах.
 */

import { describe, it, expect } from 'vitest'
import {
  getRuleByPath,
  removeByPath,
  insertAtPosition,
  adjustPathAfterRemoval,
  adjustIndexAfterRemoval,
  pathToId,
  idToPath,
  type RulePath,
} from './filterPathUtils'
import type { FilterGroup, FilterRule, FilterCondition } from '../types'

// ── Helpers для построения тестовых деревьев ───────────────────────────────

const cond = (field: string, value: unknown = null): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'equals',
  value,
})

const group = (rules: FilterRule[], logic: 'and' | 'or' = 'and'): FilterGroup => ({
  logic,
  rules,
})

const groupRule = (rules: FilterRule[], logic: 'and' | 'or' = 'and'): FilterRule => ({
  type: 'group',
  group: group(rules, logic),
})

// ── getRuleByPath ──────────────────────────────────────────────────────────

describe('getRuleByPath', () => {
  it('возвращает null для пустого path', () => {
    const g = group([cond('a'), cond('b')])
    expect(getRuleByPath(g, [])).toBeNull()
  })

  it('возвращает правило по индексу depth=1', () => {
    const c = cond('foo', 'bar')
    const g = group([cond('a'), c, cond('z')])
    expect(getRuleByPath(g, [1])).toEqual(c)
  })

  it('возвращает правило по path depth=2 (внутри подгруппы)', () => {
    const target = cond('inner', 42)
    const g = group([cond('a'), groupRule([cond('x'), target, cond('y')])])
    expect(getRuleByPath(g, [1, 1])).toEqual(target)
  })

  it('возвращает правило по path depth=3', () => {
    const target = cond('deep')
    const g = group([groupRule([groupRule([cond('a'), target])])])
    expect(getRuleByPath(g, [0, 0, 1])).toEqual(target)
  })

  it('возвращает null если индекс выходит за границы', () => {
    const g = group([cond('a')])
    expect(getRuleByPath(g, [5])).toBeNull()
  })

  it('возвращает null если path спускается в condition (не группу)', () => {
    const g = group([cond('a'), cond('b')])
    // Пытаемся войти внутрь условия — нельзя
    expect(getRuleByPath(g, [0, 0])).toBeNull()
  })
})

// ── removeByPath ───────────────────────────────────────────────────────────

describe('removeByPath', () => {
  it('возвращает группу без изменений и null для пустого path', () => {
    const g = group([cond('a'), cond('b')])
    const [next, removed] = removeByPath(g, [])
    expect(next).toEqual(g)
    expect(removed).toBeNull()
  })

  it('удаляет правило depth=1 и возвращает удалённое', () => {
    const a = cond('a')
    const b = cond('b')
    const c = cond('c')
    const g = group([a, b, c])
    const [next, removed] = removeByPath(g, [1])
    expect(next.rules).toEqual([a, c])
    expect(removed).toEqual(b)
  })

  it('удаляет первое и последнее правила корректно', () => {
    const g = group([cond('a'), cond('b'), cond('c')])
    expect(removeByPath(g, [0])[0].rules).toHaveLength(2)
    expect(removeByPath(g, [2])[0].rules).toHaveLength(2)
  })

  it('удаляет правило depth=2 (внутри подгруппы)', () => {
    const inner = cond('target')
    const g = group([cond('a'), groupRule([cond('x'), inner, cond('y')])])
    const [next, removed] = removeByPath(g, [1, 1])
    expect(removed).toEqual(inner)
    // Корневая группа не изменилась — только подгруппа
    expect(next.rules).toHaveLength(2)
    const innerGroup = next.rules[1] as { type: 'group'; group: FilterGroup }
    expect(innerGroup.group.rules).toHaveLength(2)
    expect(innerGroup.group.rules.map((r) => (r as FilterCondition).field)).toEqual(['x', 'y'])
  })

  it('возвращает null если path указывает на несуществующий индекс', () => {
    const g = group([cond('a')])
    const [, removed] = removeByPath(g, [5])
    expect(removed).toBeNull()
  })

  it('возвращает null если path спускается в condition вместо группы', () => {
    const g = group([cond('a'), cond('b')])
    const [, removed] = removeByPath(g, [0, 0])
    expect(removed).toBeNull()
  })

  it('не мутирует исходную группу', () => {
    const g = group([cond('a'), cond('b')])
    const original = JSON.parse(JSON.stringify(g))
    removeByPath(g, [0])
    expect(g).toEqual(original)
  })
})

// ── insertAtPosition ───────────────────────────────────────────────────────

describe('insertAtPosition', () => {
  it('вставляет в начало корневой группы (insertIdx = 0)', () => {
    const g = group([cond('b'), cond('c')])
    const next = insertAtPosition(g, [], 0, cond('a'))
    expect(next.rules.map((r) => (r as FilterCondition).field)).toEqual(['a', 'b', 'c'])
  })

  it('вставляет в середину корневой группы', () => {
    const g = group([cond('a'), cond('c')])
    const next = insertAtPosition(g, [], 1, cond('b'))
    expect(next.rules.map((r) => (r as FilterCondition).field)).toEqual(['a', 'b', 'c'])
  })

  it('вставляет в конец корневой группы', () => {
    const g = group([cond('a'), cond('b')])
    const next = insertAtPosition(g, [], 2, cond('c'))
    expect(next.rules.map((r) => (r as FilterCondition).field)).toEqual(['a', 'b', 'c'])
  })

  it('вставляет в подгруппу depth=1', () => {
    const g = group([cond('outer'), groupRule([cond('x'), cond('y')])])
    const next = insertAtPosition(g, [1], 1, cond('inserted'))
    const inner = next.rules[1] as { type: 'group'; group: FilterGroup }
    expect(inner.group.rules.map((r) => (r as FilterCondition).field)).toEqual([
      'x',
      'inserted',
      'y',
    ])
  })

  it('возвращает группу без изменений если groupPath ведёт в condition', () => {
    const g = group([cond('a'), cond('b')])
    const next = insertAtPosition(g, [0], 0, cond('inserted'))
    expect(next).toEqual(g)
  })

  it('не мутирует исходную группу', () => {
    const g = group([cond('a')])
    const original = JSON.parse(JSON.stringify(g))
    insertAtPosition(g, [], 1, cond('b'))
    expect(g).toEqual(original)
  })
})

// ── adjustPathAfterRemoval ─────────────────────────────────────────────────

describe('adjustPathAfterRemoval', () => {
  it('возвращает targetPath без изменений если removedPath пуст', () => {
    expect(adjustPathAfterRemoval([1, 2], [])).toEqual([1, 2])
  })

  it('возвращает targetPath без изменений если targetPath пуст', () => {
    expect(adjustPathAfterRemoval([], [0])).toEqual([])
  })

  it('сдвигает индекс на -1 если удаление в той же группе перед target', () => {
    // Корневая группа: удаляем индекс 1, target был 3 → станет 2
    expect(adjustPathAfterRemoval([3], [1])).toEqual([2])
  })

  it('не сдвигает индекс если удаление в той же группе после target', () => {
    // Корневая группа: удаляем индекс 5, target был 3 → остаётся 3
    expect(adjustPathAfterRemoval([3], [5])).toEqual([3])
  })

  it('сдвигает индекс подгруппы если удаление в той же родительской группе перед ним', () => {
    // Удаляем [0, 1], target [0, 3, 2] → станет [0, 2, 2]
    expect(adjustPathAfterRemoval([0, 3, 2], [0, 1])).toEqual([0, 2, 2])
  })

  it('не трогает target в другой ветке дерева', () => {
    // Удаляем [0, 1], target [1, 2] — другая ветка корня
    expect(adjustPathAfterRemoval([1, 2], [0, 1])).toEqual([1, 2])
  })

  it('не трогает target если родительская группа глубже removedPath', () => {
    // removedPath глубже, чем targetPath — не должно повлиять
    expect(adjustPathAfterRemoval([0], [0, 1, 2])).toEqual([0])
  })
})

// ── adjustIndexAfterRemoval ────────────────────────────────────────────────

describe('adjustIndexAfterRemoval', () => {
  it('сдвигает insertIdx на -1 если удаление в той же группе перед ним', () => {
    // Корень, целевой insertIdx 5, удалили [2] — insertIdx → 4
    expect(adjustIndexAfterRemoval([], 5, [2])).toBe(4)
  })

  it('не сдвигает insertIdx если удаление после', () => {
    expect(adjustIndexAfterRemoval([], 2, [5])).toBe(2)
  })

  it('не сдвигает insertIdx если удаление в другой группе', () => {
    expect(adjustIndexAfterRemoval([0], 3, [1])).toBe(3)
  })

  it('сдвигает insertIdx внутри подгруппы корректно', () => {
    // targetGroupPath [0, 1], targetIdx 4, removed [0, 1, 2]
    expect(adjustIndexAfterRemoval([0, 1], 4, [0, 1, 2])).toBe(3)
  })
})

// ── pathToId / idToPath ────────────────────────────────────────────────────

describe('pathToId / idToPath', () => {
  it('round-trip: depth=1', () => {
    const path: RulePath = [3]
    const id = pathToId('filter-abc', path)
    expect(id).toBe('filter-abc:rule:3')
    expect(idToPath('filter-abc', id)).toEqual({ type: 'rule', path: [3] })
  })

  it('round-trip: depth=3', () => {
    const path: RulePath = [0, 2, 1]
    const id = pathToId('prefix', path)
    expect(id).toBe('prefix:rule:0-2-1')
    expect(idToPath('prefix', id)).toEqual({ type: 'rule', path: [0, 2, 1] })
  })

  it('idToPath возвращает null для невалидного prefix', () => {
    expect(idToPath('expected', 'other:rule:1')).toBeNull()
  })

  it('idToPath возвращает null для id без rule:', () => {
    expect(idToPath('prefix', 'prefix:something')).toBeNull()
  })

  it('idToPath возвращает null если id вообще не содержит prefix:', () => {
    expect(idToPath('prefix', 'random-string')).toBeNull()
  })
})
