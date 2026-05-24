/**
 * Тесты useFilterDnD — drag-and-drop логика редактора фильтров.
 *
 * Хук изолированный (чистая логика, без UI/queries), поэтому тестируется
 * через renderHook + ручное конструирование @dnd-kit events.
 *
 * Path-утилиты, на которых строится логика, покрыты отдельно в
 * filterPathUtils.test.ts.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import { useFilterDnD } from './useFilterDnD'
import { pathToId } from '@/lib/filters/filterPathUtils'
import type { FilterCondition, FilterGroup, FilterRule } from '@/lib/filters/types'

// ── Helpers ─────────────────────────────────────────────

const cond = (field: string): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'equals',
  value: null,
})

const groupRule = (rules: FilterRule[]): FilterRule => ({
  type: 'group',
  group: { logic: 'and', rules },
})

/** Простой ClientRect-подобный для over.rect. */
const rect = (top: number, height: number) => ({
  top,
  height,
  bottom: top + height,
  left: 0,
  right: 100,
  width: 100,
})

const startEvent = (id: string): DragStartEvent =>
  ({ active: { id, data: { current: undefined }, rect: { current: { initial: null, translated: null } } } }) as unknown as DragStartEvent

const overEvent = (
  activeId: string,
  overId: string,
  overRect: ReturnType<typeof rect>,
  pointerY: number,
  deltaY = 0,
): DragOverEvent =>
  ({
    active: { id: activeId },
    over: { id: overId, rect: overRect },
    delta: { x: 0, y: deltaY },
    activatorEvent: { clientY: pointerY } as PointerEvent,
  }) as unknown as DragOverEvent

const endEvent = (activeId: string, overId: string | null): DragEndEvent =>
  ({
    active: { id: activeId },
    over: overId == null ? null : { id: overId },
  }) as unknown as DragEndEvent

const PREFIX = 'filter-test'

// ── Tests ───────────────────────────────────────────────

describe('useFilterDnD', () => {
  describe('handleDragStart', () => {
    it('устанавливает activeRule из пути', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('name'), cond('status')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      act(() => {
        result.current.handleDragStart(startEvent(pathToId(PREFIX, [1])))
      })

      expect(result.current.activeRule).toEqual(cond('status'))
    })

    it('игнорирует id с чужим префиксом', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('name')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      act(() => {
        result.current.handleDragStart(startEvent('alien-prefix:0'))
      })

      expect(result.current.activeRule).toBeNull()
    })
  })

  describe('handleDragOver', () => {
    it('position="top" когда pointer выше середины целевого элемента', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      const sourceId = pathToId(PREFIX, [0])
      const targetId = pathToId(PREFIX, [1])
      // Целевой rect: top=100, height=40, середина=120. Pointer на 110 → выше.
      act(() => {
        result.current.handleDragOver(overEvent(sourceId, targetId, rect(100, 40), 110))
      })

      expect(result.current.dropIndicator).toEqual({ targetPath: [1], position: 'top' })
    })

    it('position="bottom" когда pointer ниже середины', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      const sourceId = pathToId(PREFIX, [0])
      const targetId = pathToId(PREFIX, [1])
      // Целевой rect: top=100, height=40, середина=120. Pointer на 130 → ниже.
      act(() => {
        result.current.handleDragOver(overEvent(sourceId, targetId, rect(100, 40), 130))
      })

      expect(result.current.dropIndicator).toEqual({ targetPath: [1], position: 'bottom' })
    })

    it('сбрасывает indicator когда active.id === over.id', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      const sameId = pathToId(PREFIX, [0])
      act(() => {
        result.current.handleDragOver(overEvent(sameId, sameId, rect(0, 40), 20))
      })

      expect(result.current.dropIndicator).toBeNull()
    })

    it('сбрасывает indicator когда over.id невалидный', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      act(() => {
        result.current.handleDragOver(
          overEvent(pathToId(PREFIX, [0]), 'alien:0', rect(0, 40), 20),
        )
      })

      expect(result.current.dropIndicator).toBeNull()
    })
  })

  describe('handleDragEnd', () => {
    it('перемещает condition вверх (position=top)', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b'), cond('c')] }
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange, dndPrefix: PREFIX }),
      )

      // Поднимаем c (path=[2]) перед a (path=[0]). Каждое событие — в своём
      // act(), иначе handleDragEnd видит замкнутый старый dropIndicator (=null)
      // и сразу возвращается из-за `if (!indicator) return`.
      const sourceId = pathToId(PREFIX, [2])
      const targetId = pathToId(PREFIX, [0])
      act(() => { result.current.handleDragStart(startEvent(sourceId)) })
      act(() => { result.current.handleDragOver(overEvent(sourceId, targetId, rect(0, 40), 10)) })
      act(() => { result.current.handleDragEnd(endEvent(sourceId, targetId)) })

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange.mock.calls[0][0].rules).toEqual([cond('c'), cond('a'), cond('b')])
    })

    it('перемещает condition вниз (position=bottom)', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b'), cond('c')] }
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange, dndPrefix: PREFIX }),
      )

      // Опускаем a (path=[0]) после c (path=[2]).
      const sourceId = pathToId(PREFIX, [0])
      const targetId = pathToId(PREFIX, [2])
      act(() => { result.current.handleDragStart(startEvent(sourceId)) })
      act(() => { result.current.handleDragOver(overEvent(sourceId, targetId, rect(100, 40), 130)) })
      act(() => { result.current.handleDragEnd(endEvent(sourceId, targetId)) })

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange.mock.calls[0][0].rules).toEqual([cond('b'), cond('c'), cond('a')])
    })

    it('no-op если перемещение в ту же позицию', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b')] }
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange, dndPrefix: PREFIX }),
      )

      // Тянем b на саму себя — drag-over сбросит indicator, drag-end ничего не сделает.
      const sourceId = pathToId(PREFIX, [1])
      act(() => {
        result.current.handleDragStart(startEvent(sourceId))
        result.current.handleDragOver(overEvent(sourceId, sourceId, rect(0, 40), 20))
        result.current.handleDragEnd(endEvent(sourceId, sourceId))
      })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('запрещает перемещение группы внутрь самой себя', () => {
      // Внешняя группа [outerGroup, leafC], outerGroup содержит [innerGroup].
      // Пытаемся утащить outerGroup внутрь innerGroup — должен быть no-op.
      const g: FilterGroup = {
        logic: 'and',
        rules: [
          groupRule([groupRule([cond('inner-a')])]),
          cond('c'),
        ],
      }
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange, dndPrefix: PREFIX }),
      )

      const sourceId = pathToId(PREFIX, [0]) // outerGroup
      const targetId = pathToId(PREFIX, [0, 0]) // innerGroup внутри outerGroup
      act(() => {
        result.current.handleDragStart(startEvent(sourceId))
        result.current.handleDragOver(overEvent(sourceId, targetId, rect(0, 40), 20))
        result.current.handleDragEnd(endEvent(sourceId, targetId))
      })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('не вызывает onChange если over отсутствует', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b')] }
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange, dndPrefix: PREFIX }),
      )

      act(() => {
        result.current.handleDragStart(startEvent(pathToId(PREFIX, [0])))
        result.current.handleDragEnd(endEvent(pathToId(PREFIX, [0]), null))
      })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('сбрасывает activeRule и dropIndicator после end', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      const sourceId = pathToId(PREFIX, [0])
      const targetId = pathToId(PREFIX, [1])
      act(() => {
        result.current.handleDragStart(startEvent(sourceId))
        result.current.handleDragOver(overEvent(sourceId, targetId, rect(0, 40), 10))
      })
      expect(result.current.activeRule).not.toBeNull()
      expect(result.current.dropIndicator).not.toBeNull()

      act(() => {
        result.current.handleDragEnd(endEvent(sourceId, targetId))
      })

      expect(result.current.activeRule).toBeNull()
      expect(result.current.dropIndicator).toBeNull()
    })
  })

  describe('handleDragCancel', () => {
    it('сбрасывает activeRule и dropIndicator', () => {
      const g: FilterGroup = { logic: 'and', rules: [cond('a'), cond('b')] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )

      const sourceId = pathToId(PREFIX, [0])
      const targetId = pathToId(PREFIX, [1])
      act(() => {
        result.current.handleDragStart(startEvent(sourceId))
        result.current.handleDragOver(overEvent(sourceId, targetId, rect(0, 40), 10))
      })
      expect(result.current.activeRule).not.toBeNull()
      expect(result.current.dropIndicator).not.toBeNull()

      act(() => {
        result.current.handleDragCancel()
      })

      expect(result.current.activeRule).toBeNull()
      expect(result.current.dropIndicator).toBeNull()
    })
  })

  describe('sensors', () => {
    it('возвращает массив sensors', () => {
      const g: FilterGroup = { logic: 'and', rules: [] }
      const { result } = renderHook(() =>
        useFilterDnD({ group: g, onChange: vi.fn(), dndPrefix: PREFIX }),
      )
      expect(Array.isArray(result.current.sensors)).toBe(true)
      expect(result.current.sensors.length).toBeGreaterThan(0)
    })
  })
})
