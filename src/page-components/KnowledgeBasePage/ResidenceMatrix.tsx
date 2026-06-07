'use client'

/**
 * Матрица «критерии × виды ВНЖ» (Контур 1, Шаг 2) — read-only обзор.
 * Строки — критерии по группам, столбцы — виды ВНЖ, ячейка — порог из правил.
 */

import { useMemo } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildResidenceMatrix, formatCell } from '@/lib/residence/matrix'
import type { ResidenceCatalog } from '@/lib/residence/types'

export function ResidenceMatrix({
  catalog,
  visibleTypeIds,
}: {
  catalog: ResidenceCatalog
  /** Если задан — показываем только эти виды ВНЖ (столбцы). */
  visibleTypeIds?: string[]
}) {
  const matrix = useMemo(() => buildResidenceMatrix(catalog), [catalog])
  const { rows, cells } = matrix

  const residenceTypes = useMemo(
    () =>
      visibleTypeIds
        ? matrix.residenceTypes.filter((rt) => visibleTypeIds.includes(rt.id))
        : matrix.residenceTypes,
    [matrix.residenceTypes, visibleTypeIds],
  )

  if (matrix.residenceTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Для страны нет видов ВНЖ.</p>
  }
  if (residenceTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Не выбрано ни одного вида ВНЖ.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium min-w-[260px]">
              Критерий
            </th>
            {residenceTypes.map((rt) => (
              <th
                key={rt.id}
                className="px-2 py-2 text-left font-medium align-bottom min-w-[110px] max-w-[140px]"
                title={rt.name_ru || rt.name_en}
              >
                <div className="line-clamp-3 text-xs leading-tight">{rt.name_ru || rt.name_en}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <GroupRows
              key={row.group?.id ?? 'ungrouped'}
              row={row}
              residenceTypeIds={residenceTypes.map((rt) => rt.id)}
              cells={cells}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({
  row,
  residenceTypeIds,
  cells,
}: {
  row: ReturnType<typeof buildResidenceMatrix>['rows'][number]
  residenceTypeIds: string[]
  cells: ReturnType<typeof buildResidenceMatrix>['cells']
}) {
  return (
    <>
      <tr className="border-b bg-muted/20">
        <td
          colSpan={residenceTypeIds.length + 1}
          className="sticky left-0 px-3 py-1.5 text-xs font-semibold text-muted-foreground"
        >
          📁 {row.group ? row.group.name_ru || row.group.name_en : 'Без группы'}
        </td>
      </tr>
      {row.criteria.map((crit) => {
        const fieldMap = cells.get(crit.field_key)
        return (
          <tr key={crit.id} className="border-b hover:bg-muted/20">
            <td className="sticky left-0 z-10 bg-background px-3 py-1.5 align-top">
              <div className="flex items-start gap-1">
                <span className="line-clamp-2">{crit.title_ru || crit.title_en}</span>
                {crit.is_askable && (
                  <span
                    className="mt-0.5 shrink-0"
                    title={crit.question_ru || crit.title_ru}
                    aria-label="Анкетируемый"
                  >
                    <HelpCircle className="h-3 w-3 text-primary/60" />
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {crit.field_type}{!crit.is_askable && ' · не спрашивается'}
              </span>
            </td>
            {residenceTypeIds.map((rtId) => {
              const cell = fieldMap?.get(rtId) ?? null
              return (
                <td key={rtId} className="px-2 py-1.5 align-top">
                  {cell ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                        cell.severity === 'critical'
                          ? 'bg-primary/10 text-foreground font-medium'
                          : 'bg-muted text-muted-foreground',
                      )}
                      title={cell.conflict ? 'Разные значения в разных процедурах' : undefined}
                    >
                      {formatCell(cell, crit)}
                      {cell.conflict && <span className="text-amber-500">*</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              )
            })}
          </tr>
        )
      })}
    </>
  )
}
