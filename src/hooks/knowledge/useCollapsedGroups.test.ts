import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCollapsedGroups } from './useCollapsedGroups'

const KEY = 'kb-collapsed:test:articles'

// jsdom в проекте запущен с неполным localStorage — подкладываем полный мок
// (тот же паттерн, что в sidePanelStore.localStorage.test.ts)
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      store = {}
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
  }
}

describe('useCollapsedGroups', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('стартует пустым и toggle сворачивает/разворачивает', () => {
    const { result } = renderHook(() => useCollapsedGroups(KEY))
    expect(result.current.collapsedGroups.size).toBe(0)

    act(() => result.current.toggleCollapse('g1'))
    expect(result.current.collapsedGroups.has('g1')).toBe(true)

    act(() => result.current.toggleCollapse('g1'))
    expect(result.current.collapsedGroups.has('g1')).toBe(false)
  })

  it('персистит в localStorage и восстанавливает при новом маунте', () => {
    const first = renderHook(() => useCollapsedGroups(KEY))
    act(() => first.result.current.toggleCollapse('g1'))
    first.unmount()

    const second = renderHook(() => useCollapsedGroups(KEY))
    expect(second.result.current.collapsedGroups.has('g1')).toBe(true)
  })

  it('collapseAll / expandAll заменяют набор целиком', () => {
    const { result } = renderHook(() => useCollapsedGroups(KEY))
    act(() => result.current.collapseAll(['a', 'b']))
    expect([...result.current.collapsedGroups].sort()).toEqual(['a', 'b'])

    act(() => result.current.expandAll())
    expect(result.current.collapsedGroups.size).toBe(0)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([])
  })

  it('вычищает ids удалённых групп при записи (прунинг по liveGroupIds)', () => {
    localStorage.setItem(KEY, JSON.stringify(['dead', 'alive']))
    const { result } = renderHook(() => useCollapsedGroups(KEY, ['alive', 'other']))

    act(() => result.current.toggleCollapse('other'))
    expect([...result.current.collapsedGroups].sort()).toEqual(['alive', 'other'])
    expect(JSON.parse(localStorage.getItem(KEY)!).sort()).toEqual(['alive', 'other'])
  })

  it('без liveGroupIds (группы ещё не загружены) ничего не вычищает', () => {
    localStorage.setItem(KEY, JSON.stringify(['g1']))
    const { result } = renderHook(() => useCollapsedGroups(KEY, []))
    act(() => result.current.toggleCollapse('g2'))
    expect([...result.current.collapsedGroups].sort()).toEqual(['g1', 'g2'])
  })

  it('игнорирует битый JSON в хранилище', () => {
    localStorage.setItem(KEY, 'не json')
    const { result } = renderHook(() => useCollapsedGroups(KEY))
    expect(result.current.collapsedGroups.size).toBe(0)
  })
})
