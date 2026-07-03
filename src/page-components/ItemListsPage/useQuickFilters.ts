"use client"

/**
 * Быстрый фильтр таблицы по клику на заголовок колонки. Два вида:
 *  - `enum` (по умолчанию) — чекбоксы distinct-значений из ТЕКУЩЕГО набора строк
 *    (то, что реально есть в списке). Строка проходит, если ХОТЯ БЫ одно её
 *    значение выбрано (для колонок с несколькими значениями — исполнители).
 *  - `text` — поиск по вхождению подстроки (для колонок вроде «Название», где
 *    значения уникальны и чекбоксы бессмысленны).
 *
 * Фильтрация клиентская, поверх фильтра самого списка; состояние сессионное
 * (не сохраняется). Между колонками — AND.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ColumnFilterMeta } from './TableShell'

const EMPTY_SET: ReadonlySet<string> = new Set()

export type QuickFilterColumn<T> =
  | { kind?: 'enum'; key: string; getValues: (row: T) => { value: string; label: string }[] }
  | { kind: 'text'; key: string; getText: (row: T) => string }

export function useQuickFilters<T>(rows: T[], config: QuickFilterColumn<T>[]) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [text, setTextState] = useState<Record<string, string>>({})

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

  const setText = useCallback((key: string, q: string) => {
    setTextState((prev) => {
      const next = { ...prev }
      if (q) next[key] = q
      else delete next[key]
      return next
    })
  }, [])

  const clearText = useCallback((key: string) => {
    setTextState((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // Доступные значения по каждой enum-колонке (distinct из текущих строк).
  const options = useMemo(() => {
    const acc: Record<string, Map<string, string>> = {}
    for (const c of config) if (c.kind !== 'text') acc[c.key] = new Map()
    for (const row of rows) {
      for (const c of config) {
        if (c.kind === 'text') continue
        for (const { value, label } of c.getValues(row)) acc[c.key].set(value, label)
      }
    }
    return acc
  }, [rows, config])

  // Применить активные фильтры к списку.
  const apply = useCallback(
    (list: T[]): T[] => {
      const enumKeys = Object.keys(selected)
      const textKeys = Object.keys(text)
      if (enumKeys.length === 0 && textKeys.length === 0) return list
      const byKey = new Map(config.map((c) => [c.key, c]))
      return list.filter((row) => {
        for (const k of enumKeys) {
          const sel = selected[k]
          const cfg = byKey.get(k)
          if (!cfg || cfg.kind === 'text') continue
          if (!cfg.getValues(row).some((v) => sel.has(v.value))) return false
        }
        for (const k of textKeys) {
          const q = text[k].trim().toLowerCase()
          if (!q) continue
          const cfg = byKey.get(k)
          if (!cfg || cfg.kind !== 'text') continue
          if (!cfg.getText(row).toLowerCase().includes(q)) return false
        }
        return true
      })
    },
    [selected, text, config],
  )

  const columnFilter = useCallback(
    (key: string): ColumnFilterMeta | null => {
      const cfg = config.find((c) => c.key === key)
      if (cfg?.kind === 'text') {
        return {
          kind: 'text',
          query: text[key] ?? '',
          onChange: (q) => setText(key, q),
          onClear: () => clearText(key),
        }
      }
      const m = options[key]
      if (!m) return null
      return {
        kind: 'enum',
        options: [...m].map(([value, label]) => ({ value, label })).sort((a, b) =>
          a.label.localeCompare(b.label, 'ru'),
        ),
        selected: selected[key] ?? (EMPTY_SET as Set<string>),
        onToggle: (v) => toggle(key, v),
        onClear: () => clear(key),
      }
    },
    [options, selected, text, toggle, clear, setText, clearText, config],
  )

  return { apply, columnFilter }
}
