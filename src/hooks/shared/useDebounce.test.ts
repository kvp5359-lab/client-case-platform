/**
 * Тесты для useDebounce, useDebouncedCallback, useDebounceWithFlush
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce, useDebouncedCallback, useDebounceWithFlush } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('должен вернуть начальное значение сразу', () => {
    const { result } = renderHook(() => useDebounce('initial', 500))

    expect(result.current).toBe('initial')
  })

  it('должен обновить значение после задержки', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } },
    )

    // Меняем значение
    rerender({ value: 'updated', delay: 500 })

    // До истечения таймера — старое значение
    expect(result.current).toBe('initial')

    // Продвигаем таймер
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe('updated')
  })

  it('должен отменить предыдущий таймер при новом значении', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } },
    )

    // Первое обновление
    rerender({ value: 'first', delay: 500 })

    // Через 300ms — второе обновление (до истечения таймера первого)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ value: 'second', delay: 500 })

    // Ещё через 300ms — первый таймер бы уже сработал, но он отменён
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('initial')

    // Ждём остаток второго таймера
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('second')
  })
})

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('должен вызвать callback после задержки', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 500))

    act(() => {
      result.current('test')
    })

    expect(callback).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).toHaveBeenCalledWith('test')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('должен отменять предыдущий вызов при новом', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 500))

    act(() => {
      result.current('first')
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    act(() => {
      result.current('second')
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('second')
  })

  it('должен очищать таймер при unmount', () => {
    const callback = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500))

    act(() => {
      result.current('test')
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).not.toHaveBeenCalled()
  })
})

describe('useDebounceWithFlush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('должен вызвать callback немедленно при flush()', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebounceWithFlush(callback, 500))

    act(() => {
      result.current.debouncedCallback('test')
    })

    expect(callback).not.toHaveBeenCalled()

    act(() => {
      result.current.flush()
    })

    expect(callback).toHaveBeenCalledWith('test')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('должен предотвращать вызов при cancel()', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebounceWithFlush(callback, 500))

    act(() => {
      result.current.debouncedCallback('test')
    })

    act(() => {
      result.current.cancel()
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('должен вызывать callback после задержки если не отменён', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebounceWithFlush(callback, 500))

    act(() => {
      result.current.debouncedCallback('test')
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).toHaveBeenCalledWith('test')
  })

  it('flush() не должен вызывать callback если нет pending аргументов', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebounceWithFlush(callback, 500))

    act(() => {
      result.current.flush()
    })

    expect(callback).not.toHaveBeenCalled()
  })
})
