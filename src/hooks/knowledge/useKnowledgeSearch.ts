/**
 * Поиск базы знаний: (1) сохранение текущего значения между навигацией
 * (sessionStorage — переживает открытие/закрытие статьи, чистится с вкладкой),
 * (2) история поиска (localStorage).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const HISTORY_CAP = 8

function readString(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function readHistory(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Значение поиска, переживающее размонтирование (навигацию к статье и обратно). */
export function usePersistentSearch(scopeKey: string): [string, (v: string) => void] {
  const storageKey = `kb-search:${scopeKey}`
  // Инициализируем пустым (SSR-safe), восстанавливаем из sessionStorage после
  // монтирования — иначе hydration mismatch (сервер '' vs клиент сохранённое).
  const [value, setValue] = useState('')
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const stored = readString(storageKey)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setValue(stored)
  }, [storageKey])

  const set = useCallback(
    (v: string) => {
      setValue(v)
      try {
        if (v) sessionStorage.setItem(storageKey, v)
        else sessionStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  return [value, set]
}

/** История поисковых запросов (последние сверху, без дублей). */
export function useSearchHistory(scopeKey: string) {
  const storageKey = `kb-search-history:${scopeKey}`
  const [history, setHistory] = useState<string[]>(() => readHistory(storageKey))

  const persist = useCallback(
    (next: string[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  const commit = useCallback(
    (raw: string) => {
      const v = raw.trim()
      if (!v) return
      setHistory((prev) => {
        const next = [v, ...prev.filter((x) => x !== v)].slice(0, HISTORY_CAP)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const remove = useCallback(
    (v: string) => {
      setHistory((prev) => {
        const next = prev.filter((x) => x !== v)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const clear = useCallback(() => {
    setHistory([])
    persist([])
  }, [persist])

  return { history, commit, remove, clear }
}
