"use client"

/**
 * Таблица результата отчёта.
 *
 * summary: строки run_report с ключами g0..gN / a0..aM.
 *   - 0 группировок → одна строка итогов;
 *   - 1 группировка → плоские строки + строка «Итого»;
 *   - 2-3 группировки → секции по g0 с клиентскими подытогами
 *     (sectionizeRows) + строка «Итого» из серверных totals.
 * detail: строки с ключами полей датасета, форматирование по типу поля.
 */

import { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ReportConfig, ReportRow, ReportRunResult } from '@/types/reports'
import {
  getDatasetDef,
  getFieldDef,
  getMeasureDef,
  GRANULARITY_OPTIONS,
  type ReportDatasetDef,
} from '@/lib/reports/registry'
import {
  additiveMapForConfig,
  formatReportValue,
  sectionizeRows,
} from '@/lib/reports/runtime'

type MeasureColumn = {
  alias: string
  label: string
  format: 'money' | 'number'
}

/** Колонки показателей по конфигу (пустые measures → COUNT(*) как a0). */
export function measureColumns(config: ReportConfig, dataset: ReportDatasetDef | null): MeasureColumn[] {
  if (config.measures.length === 0) {
    return [{ alias: 'a0', label: 'Кол-во', format: 'number' }]
  }
  return config.measures.map((key, i) => {
    const def = dataset ? getMeasureDef(dataset, key) : null
    return {
      alias: `a${i}`,
      label: def?.label ?? key,
      format: def?.format ?? 'number',
    }
  })
}

/** Подписи колонок группировки (лейбл поля + гранулярность). */
export function groupColumns(config: ReportConfig, dataset: ReportDatasetDef | null): { alias: string; label: string }[] {
  return config.groupBy.map((g, i) => {
    const field = dataset ? getFieldDef(dataset, g.field) : null
    const gran = g.granularity
      ? GRANULARITY_OPTIONS.find((o) => o.value === g.granularity)?.label
      : null
    return {
      alias: `g${i}`,
      label: field ? field.label + (gran ? ` (${gran.toLowerCase()})` : '') : g.field,
    }
  })
}

function detailValue(row: ReportRow, dataset: ReportDatasetDef | null, key: string): string {
  const field = dataset ? getFieldDef(dataset, key) : null
  const v = row[key]
  if (field?.type === 'number') {
    return formatReportValue(v, field.money ? 'money' : 'number')
  }
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

export function ReportResultTable({
  config,
  result,
}: {
  config: ReportConfig
  result: ReportRunResult
}) {
  const dataset = getDatasetDef(config.dataset)
  const isSummary = config.mode === 'summary'
  const gCols = useMemo(() => (isSummary ? groupColumns(config, dataset) : []), [config, dataset, isSummary])
  const mCols = useMemo(() => (isSummary ? measureColumns(config, dataset) : []), [config, dataset, isSummary])

  const sections = useMemo(() => {
    if (!isSummary || gCols.length < 2) return null
    return sectionizeRows(
      result.rows,
      mCols.map((m) => m.alias),
      additiveMapForConfig(config),
    )
  }, [isSummary, gCols.length, result.rows, mCols, config])

  if (result.rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Нет данных — попробуй изменить период или фильтры.
      </div>
    )
  }

  // ── Режим списка ────────────────────────────────────────
  if (!isSummary) {
    const cols = (config.columns && config.columns.length > 0
      ? config.columns
      : Object.keys(result.rows[0] ?? {}))
    return (
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((key) => (
                <TableHead key={key}>
                  {(dataset && getFieldDef(dataset, key)?.label) || key}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, i) => (
              <TableRow key={i}>
                {cols.map((key) => (
                  <TableCell key={key} className="whitespace-nowrap max-w-[320px] truncate">
                    {detailValue(row, dataset, key)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  // ── Сводка ──────────────────────────────────────────────
  const totalsRow = result.totals
  const measureCells = (row: ReportRow, bold = false) =>
    mCols.map((m) => (
      <TableCell key={m.alias} className={`text-right tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''}`}>
        {formatReportValue(row[m.alias], m.format)}
      </TableCell>
    ))

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {gCols.map((g) => (
              <TableHead key={g.alias}>{g.label}</TableHead>
            ))}
            {mCols.map((m) => (
              <TableHead key={m.alias} className="text-right">{m.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections
            ? sections.map((section) => (
                [
                  <TableRow key={`s-${section.label}`} className="bg-muted/50">
                    <TableCell className="font-semibold" colSpan={gCols.length}>
                      {section.label}
                    </TableCell>
                    {mCols.map((m) => (
                      <TableCell key={m.alias} className="text-right tabular-nums font-semibold whitespace-nowrap">
                        {section.subtotals[m.alias] === null
                          ? '—'
                          : formatReportValue(section.subtotals[m.alias], m.format)}
                      </TableCell>
                    ))}
                  </TableRow>,
                  ...section.rows.map((row, i) => (
                    <TableRow key={`s-${section.label}-r-${i}`}>
                      <TableCell className="text-muted-foreground" />
                      {gCols.slice(1).map((g) => (
                        <TableCell key={g.alias}>{String(row[g.alias] ?? '—')}</TableCell>
                      ))}
                      {measureCells(row)}
                    </TableRow>
                  )),
                ]
              ))
            : result.rows.map((row, i) => (
                <TableRow key={i}>
                  {gCols.map((g) => (
                    <TableCell key={g.alias}>{String(row[g.alias] ?? '—')}</TableCell>
                  ))}
                  {measureCells(row)}
                </TableRow>
              ))}
          {totalsRow && (
            <TableRow className="border-t-2">
              <TableCell className="font-semibold" colSpan={Math.max(gCols.length, 1)}>
                Итого
              </TableCell>
              {measureCells(totalsRow, true)}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
