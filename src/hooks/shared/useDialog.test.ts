/**
 * Тесты для useDialog hook
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDialog, useDialogWithData } from './useDialog'

describe('useDialog', () => {
  it('должен инициализироваться с закрытым состоянием по умолчанию', () => {
    const { result } = renderHook(() => useDialog())

    expect(result.current.isOpen).toBe(false)
  })

  it('должен инициализироваться с открытым состоянием если передан defaultOpen=true', () => {
    const { result } = renderHook(() => useDialog(true))

    expect(result.current.isOpen).toBe(true)
  })

  it('должен открывать диалог при вызове open()', () => {
    const { result } = renderHook(() => useDialog())

    act(() => {
      result.current.open()
    })

    expect(result.current.isOpen).toBe(true)
  })

  it('должен закрывать диалог при вызове close()', () => {
    const { result } = renderHook(() => useDialog(true))

    act(() => {
      result.current.close()
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('должен переключать состояние при вызове toggle()', () => {
    const { result } = renderHook(() => useDialog())

    // Открываем
    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(true)

    // Закрываем
    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(false)
  })

  it('должен сохранять стабильные функции между рендерами', () => {
    const { result, rerender } = renderHook(() => useDialog())

    const firstOpen = result.current.open
    const firstClose = result.current.close
    const firstToggle = result.current.toggle

    rerender()

    expect(result.current.open).toBe(firstOpen)
    expect(result.current.close).toBe(firstClose)
    expect(result.current.toggle).toBe(firstToggle)
  })
})

describe('useDialogWithData', () => {
  it('должен иметь data: null по умолчанию', () => {
    const { result } = renderHook(() => useDialogWithData<{ name: string }>())

    expect(result.current.isOpen).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('должен устанавливать isOpen=true и data при вызове open(data)', () => {
    const { result } = renderHook(() => useDialogWithData<{ name: string }>())

    act(() => {
      result.current.open({ name: 'Тест' })
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.data).toEqual({ name: 'Тест' })
  })

  it('должен очищать data через 300ms после close()', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useDialogWithData<{ name: string }>())

    act(() => {
      result.current.open({ name: 'Тест' })
    })
    expect(result.current.data).toEqual({ name: 'Тест' })

    act(() => {
      result.current.close()
    })

    // isOpen сразу false, но data ещё есть
    expect(result.current.isOpen).toBe(false)
    expect(result.current.data).toEqual({ name: 'Тест' })

    // Через 300ms data очищается
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.data).toBeNull()

    vi.useRealTimers()
  })

  it('должен использовать defaultData параметр', () => {
    const defaultData = { name: 'Default' }
    const { result } = renderHook(() =>
      useDialogWithData<{ name: string }>(false, defaultData),
    )

    expect(result.current.data).toEqual({ name: 'Default' })
    expect(result.current.isOpen).toBe(false)
  })

  it('должен вызывать close() при toggle() когда диалог открыт', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useDialogWithData<{ name: string }>())

    act(() => {
      result.current.open({ name: 'Тест' })
    })
    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.isOpen).toBe(false)

    // data очищается через 300ms (поведение close())
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.data).toBeNull()

    vi.useRealTimers()
  })
})
