'use client'

/**
 * Обзор ВНЖ (Контур 1). Столбцы — виды ВНЖ. Группы критериев — ОБЩИЕ горизонтальные
 * секции (заголовок на всю ширину). Под каждой группой в колонке ВНЖ — её критерии
 * со значениями. Клик по строке (владельцу) → правка условия для этого ВНЖ.
 */

import { useMemo } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildResidenceMatrix, formatCell, type MatrixCell } from '@/lib/residence/matrix'
import type { ResidenceCatalog, ResidenceCriterion } from '@/lib/residence/types'

export type EditConditionFn = (criterion: ResidenceCriterion, residenceTypeId: string, cell: MatrixCell) => void
export type AddConditionFn = (groupId: string | null, residenceTypeId: string) => void

export function ResidenceMatrix({
  catalog,
  visibleTypeIds,
  onEditCondition,
  onAddCondition,
}: {
  catalog: ResidenceCatalog
  /** Если задан — показываем только эти виды ВНЖ (столбцы). */
  visibleTypeIds?: string[]
  /** Если задан — клик по строке критерия открывает правку условия (для владельца). */
  onEditCondition?: EditConditionFn
  /** Если задан — в ячейке группы появляется «+ добавить условие». */
  onAddCondition?: AddConditionFn
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
              groupId={row.group?.id ?? null}
              groupName={row.group ? row.group.name_ru || row.group.name_en : 'Без группы'}
              criteria={row.criteria}
              residenceTypeIds={residenceTypes.map((rt) => rt.id)}
              cells={cells}
              onEditCondition={onEditCondition}
              onAddCondition={onAddCondition}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupSection({
  groupId,
  groupName,
  criteria,
  residenceTypeIds,
  cells,
  onEditCondition,
  onAddCondition,
}: {
  groupId: string | null
  groupName: string
  criteria: ResidenceCriterion[]
  residenceTypeIds: string[]
  cells: ReturnType<typeof buildResidenceMatrix>['cells']
  onEditCondition?: EditConditionFn
  onAddCondition?: AddConditionFn
}) {
  return (
    <>
      <tr className="border-y-2 border-border bg-muted">
        <td
          colSpan={residenceTypeIds.length}
          className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground"
        >
          📁 {groupName}
        </td>
      </tr>
      <tr className="border-b">
        {residenceTypeIds.map((rtId) => {
          const items = criteria
            .map((crit) => ({ crit, cell: cells.get(crit.field_key)?.get(rtId) ?? null }))
            .filter((x) => x.cell !== null)
          return (
            <td key={rtId} className="group/cell align-top border-l first:border-l-0 p-0">
              <div className="py-1">
                {items.map(({ crit, cell }) => (
                  <CriterionRow
                    key={crit.id}
                    crit={crit}
                    cell={cell}
                    onEdit={onEditCondition ? () => onEditCondition(crit, rtId, cell) : undefined}
                  />
                ))}
                {items.length === 0 && !onAddCondition && (
                  <div className="px-3 py-1 text-xs text-muted-foreground/40">—</div>
                )}
                {onAddCondition && (
                  <button
                    type="button"
                    onClick={() => onAddCondition(groupId, rtId)}
                    className="mt-0.5 w-full px-3 py-0.5 text-left text-xs text-muted-foreground md:opacity-0 transition-opacity md:group-hover/cell:opacity-100 hover:text-foreground"
                  >
                    + добавить условие
                  </button>
                )}
              </div>
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
  onEdit,
}: {
  crit: ResidenceCriterion
  cell: MatrixCell
  onEdit?: () => void
}) {
  // boolean = «да» → значение подразумевается, не показываем (само название = требование)
  const hideValue = !!cell && typeof cell.value === 'boolean' && cell.value === true

  return (
    <div
      className={cn(
        'group/row px-3 py-0.5 text-sm leading-snug',
        onEdit ? 'cursor-pointer hover:bg-muted/40' : 'hover:bg-muted/30',
      )}
      onClick={onEdit}
      role={onEdit ? 'button' : undefined}
      title={onEdit ? 'Изменить условие для этого ВНЖ' : undefined}
    >
      <span>{crit.title_ru || crit.title_en}</span>
      {!hideValue && (
        <>
          {' — '}
          <span className={cn('font-medium', cell?.severity === 'critical' && 'text-foreground')}>
            {formatCell(cell, crit)}
          </span>
          {cell?.conflict && (
            <span className="text-amber-500" title="Разные значения в разных процедурах"> *</span>
          )}
        </>
      )}
      {onEdit && (
        <Pencil className="ml-1 inline h-3 w-3 align-text-top md:opacity-0 transition-opacity md:group-hover/row:opacity-100 text-muted-foreground" />
      )}
    </div>
  )
}
