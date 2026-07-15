/**
 * Тесты useTemplateDragEnd — сортировка списков шаблонов перетаскиванием.
 *
 * Хук изолированный (чистая логика поверх @dnd-kit), поэтому тестируется через
 * renderHook + ручное конструирование DragEndEvent.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useTemplateDragEnd } from './useTemplateDragEnd'

// ── Helpers ─────────────────────────────────────────────

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

/** Хуку нужны только active.id / over.id — остальное в поле не участвует. */
const dragEnd = (activeId: string, overId: string | null): DragEndEvent =>
  ({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  }) as unknown as DragEndEvent

// ── Tests ───────────────────────────────────────────────

describe('useTemplateDragEnd', () => {
  it('переставляет элемент и отдаёт новый порядок id', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTemplateDragEnd({ items, onReorder }))

    result.current.handleDragEnd(dragEnd('a', 'c'))

    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a'])
  })

  it('переставляет снизу вверх', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTemplateDragEnd({ items, onReorder }))

    result.current.handleDragEnd(dragEnd('c', 'a'))

    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b'])
  })

  it('не дёргает onReorder, если бросили на себя же', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTemplateDragEnd({ items, onReorder }))

    result.current.handleDragEnd(dragEnd('b', 'b'))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('не дёргает onReorder, если бросили мимо списка (over = null)', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTemplateDragEnd({ items, onReorder }))

    result.current.handleDragEnd(dragEnd('a', null))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('не дёргает onReorder на неизвестный id (список успел смениться)', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useTemplateDragEnd({ items, onReorder }))

    result.current.handleDragEnd(dragEnd('a', 'ghost'))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('запрещает перетаскивание при активном поиске: список отфильтрован, порядок посчитался бы по видимым строкам', () => {
    const { result } = renderHook(() =>
      useTemplateDragEnd({ items, onReorder: vi.fn(), searchQuery: 'бан' }),
    )

    expect(result.current.dragDisabled).toBe(true)
  })

  it('пробелы в поиске не считаются за поиск', () => {
    const { result } = renderHook(() =>
      useTemplateDragEnd({ items, onReorder: vi.fn(), searchQuery: '   ' }),
    )

    expect(result.current.dragDisabled).toBe(false)
  })

  it('без поиска перетаскивание разрешено', () => {
    const { result } = renderHook(() => useTemplateDragEnd({ items, onReorder: vi.fn() }))

    expect(result.current.dragDisabled).toBe(false)
  })
})
