"use client"

/**
 * Таблица результата отчёта — одна сетка колонок и одна шапка на весь отчёт.
 *
 * Модель (как в Планфиксе): колонки — ядро, группировка вешается на поле
 * колонки. Поэтому в строке группы значение группы стоит В СВОЕЙ колонке, а не
 * в отдельной, и пустых блоков не возникает:
 *
 *   строка группы  — значение уровня в колонке этого уровня + агрегаты колонок;
 *   строка записи  — свои значения во всех колонках;
 *   строка «Итого» — те же агрегаты по всем данным отчёта.
 *
 * Агрегаты уровней НЕ пересчитываются на клиенте: сервер отдаёт их по всем
 * данным группы, поэтому сумма/среднее честные, даже если записей внутри 500+
 * и догружена лишь часть.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useRunReport } from '@/hooks/useReports'
import type { ReportConfig, ReportRow, ReportRunResult, ReportTreeNode } from '@/types/reports'
import {
  aggFormat,
  getDatasetDef,
  getFieldDef,
  type ReportDatasetDef,
} from '@/lib/reports/registry'
import { buildReportTree, formatReportValue } from '@/lib/reports/runtime'
import { projectHref, threadHref } from '@/lib/entityLinks'

/** Готовая к рендеру колонка: заголовок, выравнивание, роль в отчёте. */
export type ResolvedColumn = {
  /** Ключ значения в строке результата (c0..cN — индекс колонки). */
  alias: string
  label: string
  align: 'left' | 'right'
  format: 'money' | 'number' | 'raw'
  /** Индекс уровня группировки, если по полю этой колонки группируем. */
  groupLevel: number | null
  /** Показывает ли колонка агрегат в строках групп. */
  hasAgg: boolean
  /** Ссылочное поле: значение записи ведёт на проект/тред. */
  link?: 'project' | 'thread'
}

/** Ячейка записи: для ссылочных полей — настоящая ссылка (работает средняя кнопка). */
function RecordCell({
  row,
  col,
  workspaceId,
}: {
  row: ReportRow
  col: ResolvedColumn
  workspaceId: string
}) {
  const text = cellText(row[col.alias], col.format)
  const id = row[`${col.alias}_id`]
  if (!col.link || typeof id !== 'string' || !id || text === '—') return <>{text}</>

  const pid = row[`${col.alias}_pid`]
  const href =
    col.link === 'project'
      ? projectHref(workspaceId, id)
      : threadHref(workspaceId, id, typeof pid === 'string' ? pid : null)

  return (
    <Link
      href={href}
      className="text-primary hover:underline"
      // Клик по ссылке внутри раскрытой группы не должен её схлопывать.
      onClick={(e) => e.stopPropagation()}
    >
      {text}
    </Link>
  )
}

export function resolveColumns(config: ReportConfig, dataset: ReportDatasetDef | null): ResolvedColumn[] {
  return config.columns.map((col, i) => {
    const field = dataset ? getFieldDef(dataset, col.key) : null
    const agg = col.agg ?? 'none'
    // Уровень группировки, к которому привязана колонка (первое совпадение —
    // одно поле не может быть двумя уровнями).
    const levelIdx = config.groupBy.findIndex((g) => g.field === col.key)
    return {
      alias: `c${i}`,
      label: col.label || field?.label || col.key,
      align: col.align ?? (field?.type === 'number' ? 'right' : 'left'),
      format:
        agg !== 'none'
          ? aggFormat(field, agg)
          : field?.type === 'number'
            ? (field.money ? 'money' : 'number')
            : 'raw',
      groupLevel: levelIdx >= 0 ? levelIdx : null,
      hasAgg: agg !== 'none',
      link: field?.link,
    }
  })
}

function cellText(value: unknown, format: 'money' | 'number' | 'raw'): string {
  if (format === 'raw') {
    if (value === null || value === undefined || value === '') return '—'
    return String(value)
  }
  return formatReportValue(value, format)
}

// ── Записи группы ─────────────────────────────────────────

/**
 * Записи одной группы — отдельный запрос, монтируется только при раскрытии
 * (лениво), поэтому лимит в 500 строк действует на группу, а не на отчёт.
 */
function GroupRecords({
  workspaceId,
  path,
  config,
  cols,
}: {
  workspaceId: string
  path: (string | null)[]
  config: ReportConfig
  cols: ResolvedColumn[]
}) {
  const recordsConfig = useMemo<ReportConfig>(
    () => ({ ...config, recordsFor: path }),
    [config, path],
  )
  const { data, isLoading, error } = useRunReport(workspaceId, recordsConfig)
  const indent = 12 + config.groupBy.length * 18

  if (isLoading || error || !data || data.rows.length === 0) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={cols.length} className="py-2 text-xs" style={{ paddingLeft: indent }}>
          {isLoading ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Загружаем записи…
            </span>
          ) : error ? (
            <span className="text-destructive">
              Не удалось загрузить записи: {String((error as Error).message ?? error)}
            </span>
          ) : (
            <span className="text-muted-foreground">Записей нет.</span>
          )}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {data.rows.map((row, i) => (
        <TableRow key={i}>
          {cols.map((c, ci) => (
            <TableCell
              key={c.alias}
              className={`whitespace-nowrap max-w-[320px] truncate text-muted-foreground ${
                c.align === 'right' ? 'text-right tabular-nums' : ''
              }`}
              style={ci === 0 ? { paddingLeft: indent } : undefined}
            >
              <RecordCell row={row} col={c} workspaceId={workspaceId} />
            </TableCell>
          ))}
        </TableRow>
      ))}
      {data.limitHit && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={cols.length} className="py-1 text-xs text-amber-700" style={{ paddingLeft: indent }}>
            Показаны первые {data.rowCount} записей группы — агрегаты выше считаются по всем.
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ── Дерево ────────────────────────────────────────────────

function TreeNodeRows({
  node,
  config,
  cols,
  workspaceId,
}: {
  node: ReportTreeNode
  config: ReportConfig
  cols: ResolvedColumn[]
  workspaceId: string
}) {
  const isLeaf = node.level === config.groupBy.length
  const showRecords = config.showRecords ?? false
  // Группы развёрнуты сразу, записи — по клику (они грузятся отдельно).
  const [open, setOpen] = useState(!isLeaf)
  const expandable = isLeaf ? showRecords : node.children.length > 0
  const isTop = node.level === 1
  // Колонка, в которой стоит значение этого уровня; если поле группировки
  // убрали из колонок — показываем в первой, иначе значение потерялось бы.
  const labelIdx = Math.max(
    cols.findIndex((c) => c.groupLevel === node.level - 1),
    0,
  )

  return (
    <>
      <TableRow
        className={`${expandable ? 'cursor-pointer' : ''} ${isTop ? 'bg-muted/50' : ''}`}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
      >
        {cols.map((c, i) => {
          if (i === labelIdx) {
            return (
              <TableCell
                key={c.alias}
                className={isTop ? 'font-semibold' : 'font-medium'}
                style={{ paddingLeft: 12 + (node.level - 1) * 18 }}
              >
                <span className="inline-flex items-center gap-1">
                  {expandable ? (
                    open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  {node.label}
                </span>
              </TableCell>
            )
          }
          // Агрегат колонки; у прочих колонок в строке группы пусто.
          return (
            <TableCell
              key={c.alias}
              className={`whitespace-nowrap ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${
                isTop ? 'font-semibold' : ''
              }`}
            >
              {c.hasAgg ? cellText(node.cells[c.alias], c.format) : null}
            </TableCell>
          )
        })}
      </TableRow>

      {open &&
        node.children.map((child) => (
          <TreeNodeRows
            key={JSON.stringify(child.path)}
            node={child}
            config={config}
            cols={cols}
            workspaceId={workspaceId}
          />
        ))}

      {open && isLeaf && showRecords && (
        <GroupRecords workspaceId={workspaceId} path={node.path} config={config} cols={cols} />
      )}
    </>
  )
}

// ── Точка входа ───────────────────────────────────────────

export function ReportResultTable({
  config,
  result,
  workspaceId,
}: {
  /** Итоговый конфиг (нормализованный, с вклеенным периодом). */
  config: ReportConfig
  result: ReportRunResult
  workspaceId: string
}) {
  const dataset = getDatasetDef(config.dataset)
  const hasGroups = config.groupBy.length > 0
  const cols = useMemo(() => resolveColumns(config, dataset), [config, dataset])
  const tree = useMemo(
    () => (hasGroups ? buildReportTree(result.rows, config) : []),
    [hasGroups, result.rows, config],
  )

  if (result.rows.length === 0 || cols.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Нет данных — попробуй изменить период или фильтры.
      </div>
    )
  }

  const showRecords = config.showRecords ?? false
  // «Итого» — автоматически по всем колонкам с агрегатом.
  const totalsRow: ReportRow | null = hasGroups
    ? result.totals
    : cols.some((c) => c.hasAgg)
      ? result.rows[0]
      : null

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c.alias} className={c.align === 'right' ? 'text-right' : undefined}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasGroups
            ? tree.map((node) => (
                <TreeNodeRows
                  key={JSON.stringify(node.path)}
                  node={node}
                  config={config}
                  cols={cols}
                  workspaceId={workspaceId}
                />
              ))
            : showRecords
              ? result.rows.map((row, i) => (
                  <TableRow key={i}>
                    {cols.map((c) => (
                      <TableCell
                        key={c.alias}
                        className={`whitespace-nowrap max-w-[320px] truncate ${
                          c.align === 'right' ? 'text-right tabular-nums' : ''
                        }`}
                      >
                        <RecordCell row={row} col={c} workspaceId={workspaceId} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          {totalsRow && (
            <TableRow className="border-t-2 hover:bg-transparent">
              {cols.map((c, i) => (
                <TableCell
                  key={c.alias}
                  className={`font-semibold whitespace-nowrap ${
                    c.align === 'right' ? 'text-right tabular-nums' : ''
                  }`}
                >
                  {i === 0 ? 'Итого' : c.hasAgg ? cellText(totalsRow[c.alias], c.format) : null}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
