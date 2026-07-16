/**
 * Чистые helpers исполнения отчёта на клиенте:
 * - нормализация конфига (дефолтные колонки);
 * - резолв быстрого периода в конкретные даты (пресет считается на каждый
 *   запуск — «последние 30 дней» в сохранённом отчёте всегда скользящие);
 * - вклейка периода в config перед вызовом run_report;
 * - сборка дерева строк из плоских строк с уровнями;
 * - сборка CSV.
 */

import type {
  ReportColumn,
  ReportConfig,
  ReportPeriod,
  ReportRow,
  ReportTreeNode,
} from '@/types/reports'
import type { FilterGroup } from '@/lib/filters/types'
import { formatDateToString as iso } from '@/utils/format/dateFormat'
import { getDatasetDef } from './registry'

// ── Нормализация конфига ──────────────────────────────────

/**
 * Конфиг из БД → готовый к исполнению: подставляет колонки по умолчанию,
 * если они не заданы, и режет группировки до 3 уровней.
 */
export function normalizeReportConfig(config: ReportConfig): ReportConfig {
  const dataset = getDatasetDef(config.dataset)
  const groupBy = (config.groupBy ?? []).slice(0, 3)
  const columns: ReportColumn[] =
    config.columns && config.columns.length > 0
      ? config.columns
      : (dataset?.detailDefault ?? []).map((key) => ({ key }))
  return { ...config, groupBy, columns, showRecords: config.showRecords ?? false }
}

/** Показываем плоский список записей (без групп) — крайний случай единой модели. */
export function isFlatRecordsConfig(config: ReportConfig): boolean {
  return config.groupBy.length === 0 && config.showRecords === true
}

// ── Период ────────────────────────────────────────────────

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

// ── Дерево строк ──────────────────────────────────────────

/** Ключ узла по пути значений групп (JSON — устойчив к любым значениям). */
function pathKey(path: (string | null)[]): string {
  return JSON.stringify(path)
}

function groupValue(row: ReportRow, index: number): string | null {
  const v = row[`g${index}`]
  return v === null || v === undefined ? null : String(v)
}

/** Сколько уровней групп заполнено: с сервера (level) либо по не-null g0..gN. */
function levelOf(row: ReportRow, depth: number): number {
  const raw = Number(row.level)
  if (Number.isInteger(raw) && raw >= 1 && raw <= depth) return raw
  let n = 0
  for (let i = 0; i < depth; i++) {
    if (groupValue(row, i) !== null) n = i + 1
  }
  return n
}

/**
 * Плоские строки run_report (level + g0..gN + c0..cM) → дерево.
 *
 * Подытоги НЕ считаются на клиенте: сервер отдаёт агрегаты для каждого
 * уровня по всем данным группы (GROUPING SETS), поэтому sum/avg/count честные
 * даже когда записи внутри догружены не все.
 */
export function buildReportTree(rows: ReportRow[], config: ReportConfig): ReportTreeNode[] {
  const depth = config.groupBy.length
  if (depth === 0) return []

  const roots: ReportTreeNode[] = []
  const byKey = new Map<string, ReportTreeNode>()
  // Родитель должен появиться раньше ребёнка — идём от верхних уровней.
  const ordered = [...rows].sort((a, b) => levelOf(a, depth) - levelOf(b, depth))

  for (const row of ordered) {
    const level = levelOf(row, depth)
    if (level < 1) continue
    const path: (string | null)[] = []
    for (let i = 0; i < level; i++) path.push(groupValue(row, i))

    const cells: ReportRow = {}
    for (const [k, v] of Object.entries(row)) {
      if (/^c\d+$/.test(k)) cells[k] = v
    }

    const node: ReportTreeNode = {
      level,
      path,
      label: path[level - 1] ?? '—',
      cells,
      children: [],
    }
    byKey.set(pathKey(path), node)

    if (level === 1) {
      roots.push(node)
      continue
    }
    const parent = byKey.get(pathKey(path.slice(0, level - 1)))
    // Сироты (родительский уровень не пришёл) не теряем — поднимаем в корень.
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  sortNodes(roots, config)
  return roots
}

/** Рекурсивная сортировка узлов по config.sort (gN → по названию, cN → по агрегату колонки). */
function sortNodes(nodes: ReportTreeNode[], config: ReportConfig): void {
  const by = config.sort?.by
  const dir = config.sort?.dir === 'desc' ? -1 : 1
  const idx = by && /^c\d+$/.test(by) ? Number(by.slice(1)) : null
  const sortCol = idx !== null ? config.columns[idx] : null
  // По агрегату колонки — если он у неё есть; иначе (в т.ч. колонка
  // группировки) сортируем по названию группы: агрегата там нет.
  const byCell = sortCol && (sortCol.agg ?? 'none') !== 'none' ? `c${idx}` : null

  nodes.sort((x, y) => {
    if (byCell) {
      const nx = Number(x.cells[byCell])
      const ny = Number(y.cells[byCell])
      const vx = Number.isFinite(nx) ? nx : -Infinity
      const vy = Number.isFinite(ny) ? ny : -Infinity
      if (vx !== vy) return (vx - vy) * dir
      return x.label.localeCompare(y.label, 'ru')
    }
    return x.label.localeCompare(y.label, 'ru') * dir
  })
  for (const n of nodes) sortNodes(n.children, config)
}

/** Листовые строки (все уровни групп заполнены) — для выгрузки в CSV. */
export function leafRows(rows: ReportRow[], config: ReportConfig): ReportRow[] {
  const depth = config.groupBy.length
  if (depth === 0) return rows
  return rows.filter((r) => levelOf(r, depth) === depth)
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
