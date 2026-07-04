/**
 * Типы системы отчётов.
 *
 * Отчёт = строка report_definitions с config (ReportConfig). Исполняется
 * серверной RPC run_report — она резолвит ключи датасета/полей/показателей
 * через собственный whitelist-реестр (зеркало: src/lib/reports/registry.ts).
 */

import type { FilterGroup } from '@/lib/filters/types'

export type ReportDatasetKey =
  | 'transactions'
  | 'services'
  | 'client_balance'
  | 'projects'
  | 'threads'

export type ReportMode = 'summary' | 'detail'

export type ReportDateGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export type ReportGroupBy = {
  field: string
  granularity?: ReportDateGranularity
}

export type ReportSort = {
  /** g0..gN — колонка группы, a0..aM — показатель. */
  by: string
  dir: 'asc' | 'desc'
}

export type ReportConfig = {
  dataset: ReportDatasetKey
  mode: ReportMode
  groupBy: ReportGroupBy[]
  /** Ключи показателей из реестра датасета. */
  measures: string[]
  /** Общий формат FilterGroup (как у досок/списков). */
  filter?: FilterGroup
  /** Колонки для mode='detail' (ключи полей датасета). */
  columns?: string[]
  sort?: ReportSort
}

export type ReportDefinition = {
  id: string
  workspace_id: string
  owner_user_id: string | null
  name: string
  description: string | null
  config: ReportConfig
  created_by: string
  created_at: string
  updated_at: string
}

/** Строка результата: summary → ключи g0..gN/a0..aM, detail → ключи полей. */
export type ReportRow = Record<string, unknown>

export type ReportRunResult = {
  rows: ReportRow[]
  totals: ReportRow | null
  rowCount: number
  limitHit: boolean
}

// ── Быстрый период на странице отчёта ─────────────────────

export type ReportPeriodPreset =
  | 'all'
  | 'today'
  | 'last_7'
  | 'last_30'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom'

export type ReportPeriod = {
  preset: ReportPeriodPreset
  /** Только для preset='custom', формат YYYY-MM-DD. */
  from?: string
  to?: string
}
