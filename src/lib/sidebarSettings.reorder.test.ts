import { describe, it, expect } from 'vitest'
import { reorderWithinZones, type SidebarSlot } from './sidebarSettings'

// Минимальный конструктор слота
function slot(
  id: string,
  placement: 'topbar' | 'list',
  order: number,
  parent_id: string | null = null,
  type: SidebarSlot['type'] = 'nav',
): SidebarSlot {
  return { id, type, placement, order, parent_id, badge_mode: 'disabled' } as SidebarSlot
}

describe('reorderWithinZones', () => {
  it('нумерует order=0..n-1 внутри одной зоны', () => {
    const out = reorderWithinZones([slot('a', 'list', 5), slot('b', 'list', 9), slot('c', 'list', 2)])
    expect(out.map((s) => [s.id, s.order])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
  })

  it('НЕ сортирует — сохраняет порядок массива (ключевой инвариант/gotcha)', () => {
    // Вход уже в желаемом порядке c,a,b — несмотря на исходные order-значения.
    const out = reorderWithinZones([slot('c', 'list', 2), slot('a', 'list', 5), slot('b', 'list', 9)])
    expect(out.map((s) => s.id)).toEqual(['c', 'a', 'b'])
    expect(out.map((s) => s.order)).toEqual([0, 1, 2])
  })

  it('считает зоны topbar и list независимо', () => {
    const out = reorderWithinZones([
      slot('t1', 'topbar', 0),
      slot('l1', 'list', 0),
      slot('t2', 'topbar', 0),
      slot('l2', 'list', 0),
    ])
    const byId = Object.fromEntries(out.map((s) => [s.id, s.order]))
    expect(byId).toEqual({ t1: 0, t2: 1, l1: 0, l2: 1 })
  })

  it('дети папки нумеруются отдельно от верхнего уровня', () => {
    const out = reorderWithinZones([
      slot('top1', 'list', 0),
      slot('child1', 'list', 0, 'folder:F'),
      slot('top2', 'list', 0),
      slot('child2', 'list', 0, 'folder:F'),
    ])
    const byId = Object.fromEntries(out.map((s) => [s.id, s.order]))
    // верхний уровень (parent=null): top1=0, top2=1; дети F: child1=0, child2=1
    expect(byId).toEqual({ top1: 0, top2: 1, child1: 0, child2: 1 })
  })

  it('дети разных папок в одной зоне не смешиваются', () => {
    const out = reorderWithinZones([
      slot('a1', 'list', 0, 'folder:A'),
      slot('b1', 'list', 0, 'folder:B'),
      slot('a2', 'list', 0, 'folder:A'),
    ])
    const byId = Object.fromEntries(out.map((s) => [s.id, s.order]))
    expect(byId).toEqual({ a1: 0, a2: 1, b1: 0 })
  })

  it('не мутирует исходные объекты (возвращает копии)', () => {
    const input = [slot('a', 'list', 7)]
    const out = reorderWithinZones(input)
    expect(input[0].order).toBe(7) // исходный не тронут
    expect(out[0].order).toBe(0)
    expect(out[0]).not.toBe(input[0])
  })

  it('пустой массив → пустой массив', () => {
    expect(reorderWithinZones([])).toEqual([])
  })
})
