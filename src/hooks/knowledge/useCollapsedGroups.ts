'use client'

/**
 * Состояние свёрнутости групп дерева базы знаний с запоминанием
 * в localStorage (для каждого пользователя/браузера, по ключу scope).
 *
 * `liveGroupIds` (опционально) — актуальный список групп: при каждой записи
 * из сохранённого набора вычищаются ids удалённых групп, чтобы не копить мусор.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function readStored(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function persist(key: string, next: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...next]))
  } catch {
    // квота/приватный режим — просто не запоминаем
  }
}

export function useCollapsedGroups(storageKey: string, liveGroupIds?: string[]) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => readStored(storageKey))

  const liveRef = useRef<string[] | undefined>(undefined)
  useEffect(() => {
    liveRef.current = liveGroupIds
  }, [liveGroupIds])

  // Отбрасывает ids групп, которых больше нет (пока группы не загружены — не трогаем)
  const prune = useCallback((next: Set<string>): Set<string> => {
    const live = liveRef.current
    if (!live || live.length === 0) return next
    const liveSet = new Set(live)
    return new Set([...next].filter((id) => liveSet.has(id)))
  }, [])

  const toggleCollapse = useCallback(
    (id: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        const pruned = prune(next)
        persist(storageKey, pruned)
        return pruned
      })
    },
    [storageKey, prune],
  )

  const collapseAll = useCallback(
    (groupIds: string[]) => {
      const next = new Set(groupIds)
      persist(storageKey, next)
      setCollapsedGroups(next)
    },
    [storageKey],
  )

  const expandAll = useCallback(() => {
    const next = new Set<string>()
    persist(storageKey, next)
    setCollapsedGroups(next)
  }, [storageKey])

  return useMemo(
    () => ({ collapsedGroups, toggleCollapse, collapseAll, expandAll }),
    [collapsedGroups, toggleCollapse, collapseAll, expandAll],
  )
}
