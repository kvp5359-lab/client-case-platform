/**
 * Чистые helpers исполнения отчёта на клиенте:
 * - резолв быстрого периода в конкретные даты (пресет считается на каждый
 *   запуск — «последние 30 дней» в сохранённом отчёте всегда скользящие);
 * - вклейка периода в config перед вызовом run_report;
 * - секционирование сгруппированных строк (2+ уровня) с подытогами;
 * - сборка CSV.
 */

import type {
  ReportConfig,
  ReportPeriod,
  ReportRow,
} from '@/types/reports'
import type { FilterGroup } from '@/lib/filters/types'
import { getDatasetDef, getMeasureDef } from './registry'

// ── Период ────────────────────────────────────────────────

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Пресет периода → конкретные даты [from, to] (включительно) или null (всё время). */
export function resolvePeriodRange(
  period: ReportPeriod,
  now: Date,
): { from: string; to: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period.preset) {
    case 'all':
      return null
    case 'today':
      return { from: iso(today), to: iso(today) }
    case 'last_7': {
      const from = new Date(today)
      from.setDate(from.getDate() - 6)
      return { from: iso(from), to: iso(today) }
    }
    case 'last_30': {
      const from = new Date(today)
      from.setDate(from.getDate() - 29)
      return { from: iso(from), to: iso(today) }
    }
    case 'this_month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: iso(from), to: iso(today) }
    }
    case 'last_month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const to = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: iso(from), to: iso(to) }
    }
    case 'this_year': {
      const from = new Date(today.getFullYear(), 0, 1)
      return { from: iso(from), to: iso(today) }
    }
    case 'custom': {
      if (!period.from && !period.to) return null
      return {
        from: period.from || '1970-01-01',
        to: period.to || iso(today),
      }
    }
    default:
      return null
  }
}

/**
 * Вклеить быстрый период в config (не мутируя сохранённый): добавляет
 * between-условие по periodField датасета. Датасет без periodField
 * (client_balance) период игнорирует.
 */
export function applyPeriodToConfig(
  config: ReportConfig,
  period: ReportPeriod,
  now: Date = new Date(),
): ReportConfig {
  const ds = getDatasetDef(config.dataset)
  const field = ds?.periodField
  if (!field) return config
  const range = resolvePeriodRange(period, now)
  if (!range) return config

  const periodGroup: FilterGroup = {
    logic: 'and',
    rules: [
      { type: 'condition', field, operator: 'between', value: [range.from, range.to] },
    ],
  }
  const saved = config.filter
  const merged: FilterGroup =
    saved && saved.rules.length > 0
      ? { logic: 'and', rules: [{ type: 'group', group: saved }, ...periodGroup.rules] }
      : periodGroup
  return { ...config, filter: merged }
}

// ── Секционирование (2+ уровня группировки) ───────────────

export type ReportSection = {
  /** Значение первой группы (g0). */
  label: string
  rows: ReportRow[]
  /** Подытоги по алиасам показателей (a0..): число или null (не суммируем avg). */
  subtotals: Record<string, number | null>
}

/**
 * Разложить плоские строки run_report (ключи g0/g1/aN) на секции по g0
 * с клиентскими подытогами. additiveByAlias: какие показатели суммируемы
 * (avg — нет, для них подытог null → «—»).
 */
export function sectionizeRows(
  rows: ReportRow[],
  measureAliases: string[],
  additiveByAlias: Record<string, boolean>,
): ReportSection[] {
  const sections: ReportSection[] = []
  let current: ReportSection | null = null

  for (const row of rows) {
    const label = String(row.g0 ?? '—')
    if (!current || current.label !== label) {
      current = {
        label,
        rows: [],
        subtotals: Object.fromEntries(measureAliases.map((a) => [a, additiveByAlias[a] ? 0 : null])),
      }
      sections.push(current)
    }
    current.rows.push(row)
    for (const alias of measureAliases) {
      if (!additiveByAlias[alias]) continue
      const v = row[alias]
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) {
        current.subtotals[alias] = (current.subtotals[alias] ?? 0) + n
      }
    }
  }
  // Округление накопленных сумм (плавающая точка).
  for (const s of sections) {
    for (const alias of measureAliases) {
      const v = s.subtotals[alias]
      if (typeof v === 'number') s.subtotals[alias] = Math.round(v * 100) / 100
    }
  }
  return sections
}

/** Карта additive по алиасам a0.. для выбранных показателей конфига. */
export function additiveMapForConfig(config: ReportConfig): Record<string, boolean> {
  const ds = getDatasetDef(config.dataset)
  const out: Record<string, boolean> = {}
  config.measures.forEach((key, i) => {
    const def = ds ? getMeasureDef(ds, key) : null
    out[`a${i}`] = def ? def.additive : true
  })
  if (config.measures.length === 0) out.a0 = true
  return out
}

// ── Форматирование значений ───────────────────────────────

const moneyFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const numberFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function formatReportValue(value: unknown, format: 'money' | 'number' | 'raw'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (format === 'raw') return String(value)
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return format === 'money' ? `${moneyFmt.format(n)} €` : numberFmt.format(n)
}

// ── CSV ───────────────────────────────────────────────────

function csvEscape(v: string): string {
  if (/[";\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

/**
 * CSV с BOM и «;» (русский Excel). columns: ключ строки → заголовок.
 * Значения берутся из row[key] как есть (форматирование — на вызывающем).
 */
export function buildReportCsv(
  columns: { key: string; label: string }[],
  rows: ReportRow[],
): string {
  const header = columns.map((c) => csvEscape(c.label)).join(';')
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const v = row[c.key]
        return csvEscape(v === null || v === undefined ? '' : String(v))
      })
      .join(';'),
  )
  return '﻿' + [header, ...lines].join('\r\n')
}
