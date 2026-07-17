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

export type ReportDateGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export type ReportGroupBy = {
  field: string
  granularity?: ReportDateGranularity
}

export type ReportSort = {
  /**
   * Колонка `c0..cM` (индекс в columns). Задаёт порядок записей (сервер) и
   * порядок групп (клиент — по агрегату колонки, а если его нет, по названию).
   */
  by: string
  dir: 'asc' | 'desc'
}

/**
 * Что колонка показывает В СТРОКЕ ГРУППЫ (в строке записи она всегда
 * показывает своё значение). Модель Планфикса: отдельных «показателей» нет,
 * агрегат — свойство колонки.
 *
 * sum/avg/min/max — только для числовых полей; count (количество записей
 * в группе) — для любых.
 */
export type ReportColumnAgg = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max'

export type ReportColumn = {
  /** Ключ поля датасета. Может повторяться с другим agg («Сумма» и «Среднее»). */
  key: string
  /** Свой заголовок. Пусто → имя поля из реестра. */
  label?: string
  /** По умолчанию 'none' — в строке группы ячейка пустая. */
  agg?: ReportColumnAgg
  /** Только презентация. Дефолт: числа справа, остальное слева. */
  align?: 'left' | 'right'
}

/**
 * Конфиг отчёта — единый конструктор (модель Планфикса): есть колонки, а
 * группировка накидывается поверх них. Отдельного режима «сводка/список» нет
 * и отдельных «показателей» тоже — вид следует из настроек:
 *
 *   groupBy=[]                      → плоский список записей;
 *   groupBy=[…], showRecords=false  → только строки групп с агрегатами;
 *   groupBy=[…], showRecords=true   → дерево: группы, внутри записи.
 *
 * Колонка поля, по которому группируем, показывает значение группы в строке
 * группы и своё значение в строке записи (поэтому пустых колонок не возникает).
 *
 * Строка «Итого» считается автоматически по всем колонкам с agg.
 *
 * Конфиг из report_definitions прогонять через normalizeReportConfig — она
 * подставляет дефолтные колонки, если их нет.
 */
export type ReportConfig = {
  dataset: ReportDatasetKey
  /** Уровни группировки (0..3). Пусто → плоский список записей. */
  groupBy: ReportGroupBy[]
  /** Колонки таблицы, порядок = порядок в таблице. */
  columns: ReportColumn[]
  /** Общий формат FilterGroup (как у досок/списков). */
  filter?: FilterGroup
  /** Показывать сами записи внутри последнего уровня групп. */
  showRecords?: boolean
  sort?: ReportSort
  /**
   * Значения групп по уровням — сервер вернёт записи ровно этой группы
   * (догрузка по клику). Длина = groupBy.length. Не сохраняется в отчёте.
   */
  recordsFor?: (string | null)[]
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

/**
 * Строка результата: строка группы → g0..gN (значения уровней), c0..cM
 * (агрегаты колонок по индексу в columns) и level (сколько уровней групп
 * заполнено, 1..N); строка записи → ключи полей датасета.
 */
export type ReportRow = Record<string, unknown>

/** Узел дерева строк (строится на клиенте из плоских строк, см. buildReportTree). */
export type ReportTreeNode = {
  /** 1..groupBy.length. */
  level: number
  /** Значения групп от корня до узла — им же догружаются записи (recordsFor). */
  path: (string | null)[]
  /** Значение группы этого узла (path[level-1]) для показа в таблице. */
  label: string
  /** Агрегаты колонок (ключи c0..cM) — считаны сервером по всем данным группы. */
  cells: ReportRow
  children: ReportTreeNode[]
}

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
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'custom'

export type ReportPeriod = {
  preset: ReportPeriodPreset
  /** Только для preset='custom', формат YYYY-MM-DD. */
  from?: string
  to?: string
}
