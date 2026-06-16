"use client"

/**
 * Быстрый фильтр таблицы по клику на заголовок колонки. Значения берутся ТОЛЬКО
 * из текущего набора строк (то, что реально есть в списке). Фильтрация
 * клиентская, поверх фильтра самого списка; состояние сессионное (не сохраняется).
 *
 * Каждая колонка описывается `getValues(row)` → массив {value,label}. Строка
 * проходит фильтр колонки, если ХОТЯ БЫ одно её значение выбрано (для колонок с
 * несколькими значениями, например исполнители). Между колонками — AND.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ColumnFilterMeta } from './TableShell'

const EMPTY_SET: ReadonlySet<string> = new Set()

export type QuickFilterColumn<T> = {
  key: string
  getValues: (row: T) => { value: string; label: string }[]
}

export function useQuickFilters<T>(rows: T[], config: QuickFilterColumn<T>[]) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const toggle = useCallback((key: string, value: string) => {
    setSelected((prev) => {
      const cur = new Set(prev[key] ?? [])
      if (cur.has(value)) cur.delete(value)
      else cur.add(value)
      const next = { ...prev }
      if (cur.size) next[key] = cur
      else delete next[key]
      return next
    })
  }, [])

  const clear = useCallback((key: string) => {
    setSelected((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // Доступные значения по каждой колонке (distinct из текущих строк).
  const options = useMemo(() => {
    const acc: Record<string, Map<string, string>> = {}
    for (const c of config) acc[c.key] = new Map()
    for (const row of rows) {
      for (const c of config) {
        for (const { value, label } of c.getValues(row)) acc[c.key].set(value, label)
      }
    }
    return acc
  }, [rows, config])

  // Применить активные фильтры к списку.
  const apply = useCallback(
    (list: T[]): T[] => {
      const keys = Object.keys(selected)
      if (keys.length === 0) return list
      const byKey = new Map(config.map((c) => [c.key, c]))
      return list.filter((row) =>
        keys.every((k) => {
          const sel = selected[k]
          const cfg = byKey.get(k)
          if (!cfg) return true
          return cfg.getValues(row).some((v) => sel.has(v.value))
        }),
      )
    },
    [selected, config],
  )

  const columnFilter = useCallback(
    (key: string): ColumnFilterMeta | null => {
      const m = options[key]
      if (!m) return null
      return {
        options: [...m].map(([value, label]) => ({ value, label })).sort((a, b) =>
          a.label.localeCompare(b.label, 'ru'),
        ),
        selected: selected[key] ?? (EMPTY_SET as Set<string>),
        onToggle: (v) => toggle(key, v),
        onClear: () => clear(key),
      }
    },
    [options, selected, toggle, clear],
  )

  return { apply, columnFilter }
}
