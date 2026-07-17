import { describe, it, expect } from 'vitest'
import { buildGroupDeepCountMap } from './groupDeepCounts'

describe('buildGroupDeepCountMap', () => {
  const groups = [
    { id: 'root', parent_id: null },
    { id: 'child-a', parent_id: 'root' },
    { id: 'child-b', parent_id: 'root' },
    { id: 'grandchild', parent_id: 'child-a' },
    { id: 'other-root', parent_id: null },
  ]
  const direct: Record<string, number> = {
    root: 1,
    'child-a': 2,
    'child-b': 3,
    grandchild: 4,
    'other-root': 0,
  }
  const getDirect = (id: string) => direct[id] ?? 0

  it('суммирует элементы группы и всех подгрупп любой глубины', () => {
    const counts = buildGroupDeepCountMap(groups, getDirect)
    expect(counts.get('root')).toBe(1 + 2 + 3 + 4)
    expect(counts.get('child-a')).toBe(2 + 4)
    expect(counts.get('child-b')).toBe(3)
    expect(counts.get('grandchild')).toBe(4)
  })

  it('группа без элементов и подгрупп даёт 0', () => {
    const counts = buildGroupDeepCountMap(groups, getDirect)
    expect(counts.get('other-root')).toBe(0)
  })

  it('пустой список групп даёт пустую карту', () => {
    expect(buildGroupDeepCountMap([], getDirect).size).toBe(0)
  })

  it('каждый прямой счётчик запрашивается ровно один раз (O(n))', () => {
    const calls: string[] = []
    buildGroupDeepCountMap(groups, (id) => {
      calls.push(id)
      return 0
    })
    expect(calls.sort()).toEqual(groups.map((g) => g.id).sort())
  })
})
