"use client"

/**
 * Хук для debounce значений и callback функций
 * Полезен для оптимизации форм, поиска и других частых операций
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Хук для debounce значения
 *
 * Использование:
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('')
 * const debouncedSearchTerm = useDebounce(searchTerm, 500)
 *
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     performSearch(debouncedSearchTerm)
 *   }
 * }, [debouncedSearchTerm])
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Хук для debounce callback функций.
 * Возвращает стабильную функцию, которая отменяет предыдущий вызов при новом.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<Args extends any[]>(
  callback: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)

  // Держим актуальный callback без пересоздания возвращаемой функции
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Cleanup при unmount — отменяем отложенный вызов
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback(
    (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delay)
    },
    [delay],
  )
}

/**
 * Debounced callback с возможностью принудительного вызова (flush) или отмены (cancel).
 * Полезно когда нужно "сбросить" отложенный вызов, например перед unmount или submit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebounceWithFlush<Args extends any[]>(
  callback: (...args: Args) => void,
  delay: number,
): {
  debouncedCallback: (...args: Args) => void
  flush: () => void
  cancel: () => void
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgsRef = useRef<Args | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const debouncedCallback = useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        if (pendingArgsRef.current) {
          callbackRef.current(...pendingArgsRef.current)
          pendingArgsRef.current = null
        }
      }, delay)
    },
    [delay],
  )

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingArgsRef.current) {
      callbackRef.current(...pendingArgsRef.current)
      pendingArgsRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingArgsRef.current = null
  }, [])

  return { debouncedCallback, flush, cancel }
}
