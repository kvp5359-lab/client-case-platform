'use client'

/**
 * Обзор ВНЖ (Контур 1). Столбцы — виды ВНЖ. Группы критериев — ОБЩИЕ горизонтальные
 * секции (заголовок на всю ширину). Под каждой группой в колонке ВНЖ — её критерии
 * со значениями (только используемые в этом ВНЖ).
 */

import { useMemo } from 'react'
import { HelpCircle, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildResidenceMatrix, formatCell, type MatrixCell } from '@/lib/residence/matrix'
import type { ResidenceCatalog, ResidenceCriterion } from '@/lib/residence/types'

export function ResidenceMatrix({
  catalog,
  visibleTypeIds,
  onEditCriterion,
}: {
  catalog: ResidenceCatalog
  /** Если задан — показываем только эти виды ВНЖ (столбцы). */
  visibleTypeIds?: string[]
  /** Если задан — у строк критериев появляется кнопка редактирования. */
  onEditCriterion?: (criterion: ResidenceCriterion) => void
}) {
  const matrix = useMemo(() => buildResidenceMatrix(catalog), [catalog])
  const { cells } = matrix

  const residenceTypes = useMemo(
    () =>
      visibleTypeIds
        ? matrix.residenceTypes.filter((rt) => visibleTypeIds.includes(rt.id))
        : matrix.residenceTypes,
    [matrix.residenceTypes, visibleTypeIds],
  )

  // только группы, где есть хоть один используемый критерий среди показанных ВНЖ
  const visibleRows = useMemo(() => {
    const ids = residenceTypes.map((rt) => rt.id)
    return matrix.rows
      .map((row) => ({
        group: row.group,
        criteria: row.criteria.filter((crit) => {
          const m = cells.get(crit.field_key)
          return !!m && ids.some((rtId) => m.has(rtId))
        }),
      }))
      .filter((row) => row.criteria.length > 0)
  }, [matrix.rows, cells, residenceTypes])

  if (matrix.residenceTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Для страны нет видов ВНЖ.</p>
  }
  if (residenceTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Не выбрано ни одного вида ВНЖ.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b bg-muted/40">
            {residenceTypes.map((rt) => (
              <th
                key={rt.id}
                className="px-3 py-2 text-left align-bottom min-w-[240px] max-w-[320px] border-l first:border-l-0"
              >
                <div className="font-semibold leading-tight">{rt.name_ru || rt.name_en}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <GroupSection
              key={row.group?.id ?? 'ungrouped'}
              groupName={row.group ? row.group.name_ru || row.group.name_en : 'Без группы'}
              criteria={row.criteria}
              residenceTypeIds={residenceTypes.map((rt) => rt.id)}
              cells={cells}
              onEditCriterion={onEditCriterion}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupSection({
  groupName,
  criteria,
  residenceTypeIds,
  cells,
  onEditCriterion,
}: {
  groupName: string
  criteria: ResidenceCriterion[]
  residenceTypeIds: string[]
  cells: ReturnType<typeof buildResidenceMatrix>['cells']
  onEditCriterion?: (criterion: ResidenceCriterion) => void
}) {
  return (
    <>
      {/* общий заголовок группы на всю ширину */}
      <tr className="border-y-2 border-border bg-muted">
        <td
          colSpan={residenceTypeIds.length}
          className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground"
        >
          📁 {groupName}
        </td>
      </tr>
      {/* по ячейке на ВНЖ — список «критерий — значение» этой группы */}
      <tr className="border-b">
        {residenceTypeIds.map((rtId) => {
          const items = criteria
            .map((crit) => ({ crit, cell: cells.get(crit.field_key)?.get(rtId) ?? null }))
            .filter((x) => x.cell !== null)
          return (
            <td key={rtId} className="align-top border-l first:border-l-0 p-0">
              {items.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/40">—</div>
              ) : (
                <div className="py-1">
                  {items.map(({ crit, cell }) => (
                    <CriterionRow
                      key={crit.id}
                      crit={crit}
                      cell={cell}
                      onEditCriterion={onEditCriterion}
                    />
                  ))}
                </div>
              )}
            </td>
          )
        })}
      </tr>
    </>
  )
}

function CriterionRow({
  crit,
  cell,
  onEditCriterion,
}: {
  crit: ResidenceCriterion
  cell: MatrixCell
  onEditCriterion?: (criterion: ResidenceCriterion) => void
}) {
  return (
    <div className="group/row px-3 py-0.5 text-sm leading-snug hover:bg-muted/30">
      <span>{crit.title_ru || crit.title_en}</span>
      {crit.is_askable && (
        <HelpCircle
          className="mx-1 inline h-3 w-3 align-text-top text-primary/60"
          aria-label="Анкетируемый"
        >
          <title>{crit.question_ru || crit.title_ru}</title>
        </HelpCircle>
      )}
      {' — '}
      <span className={cn('font-medium', cell?.severity === 'critical' && 'text-foreground')}>
        {formatCell(cell, crit)}
      </span>
      {cell?.conflict && (
        <span className="text-amber-500" title="Разные значения в разных процедурах"> *</span>
      )}
      {onEditCriterion && (
        <button
          type="button"
          onClick={() => onEditCriterion(crit)}
          className="ml-1 inline align-text-top opacity-0 transition-opacity group-hover/row:opacity-100 text-muted-foreground hover:text-foreground"
          aria-label="Редактировать критерий"
          title="Редактировать критерий"
        >
          <Pencil className="inline h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
