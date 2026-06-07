'use client'

/**
 * Обзор ВНЖ (Контур 1) — колоночный вид. Каждый вид ВНЖ — отдельная колонка-карточка,
 * внутри — критерии (по группам) со значениями только для этого ВНЖ.
 */

import { useMemo } from 'react'
import { HelpCircle, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildResidenceMatrix, formatCell } from '@/lib/residence/matrix'
import type { ResidenceCatalog, ResidenceCriterion } from '@/lib/residence/types'

export function ResidenceMatrix({
  catalog,
  visibleTypeIds,
  onEditCriterion,
}: {
  catalog: ResidenceCatalog
  /** Если задан — показываем только эти виды ВНЖ (колонки). */
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

  if (matrix.residenceTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Для страны нет видов ВНЖ.</p>
  }
  if (residenceTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Не выбрано ни одного вида ВНЖ.</p>
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {residenceTypes.map((rt) => (
        <ResidenceColumn
          key={rt.id}
          name={rt.name_ru || rt.name_en}
          rtId={rt.id}
          rows={matrix.rows}
          cells={cells}
          onEditCriterion={onEditCriterion}
        />
      ))}
    </div>
  )
}

function ResidenceColumn({
  name,
  rtId,
  rows,
  cells,
  onEditCriterion,
}: {
  name: string
  rtId: string
  rows: ReturnType<typeof buildResidenceMatrix>['rows']
  cells: ReturnType<typeof buildResidenceMatrix>['cells']
  onEditCriterion?: (criterion: ResidenceCriterion) => void
}) {
  // группы с критериями, используемыми в этом ВНЖ
  const groups = useMemo(
    () =>
      rows
        .map((row) => ({
          group: row.group,
          items: row.criteria
            .map((crit) => ({ crit, cell: cells.get(crit.field_key)?.get(rtId) ?? null }))
            .filter((x) => x.cell !== null),
        }))
        .filter((g) => g.items.length > 0),
    [rows, cells, rtId],
  )

  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="min-w-[280px] max-w-[340px] shrink-0 rounded-lg border">
      <div className="sticky top-0 z-10 rounded-t-lg border-b bg-muted px-3 py-2">
        <div className="font-semibold leading-tight">{name}</div>
        <div className="text-[11px] text-muted-foreground">{total} критериев</div>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">Нет условий</div>
      ) : (
        <div className="divide-y">
          {groups.map((g) => (
            <div key={g.group?.id ?? 'ungrouped'} className="py-1.5">
              <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {g.group ? g.group.name_ru || g.group.name_en : 'Без группы'}
              </div>
              {g.items.map(({ crit, cell }) => (
                <div
                  key={crit.id}
                  className="group/row flex items-start gap-2 px-3 py-1.5 hover:bg-muted/30"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-1">
                    <span className="text-sm leading-snug">{crit.title_ru || crit.title_en}</span>
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
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs',
                      cell?.severity === 'critical'
                        ? 'bg-primary/10 text-foreground font-medium'
                        : 'bg-muted text-muted-foreground',
                    )}
                    title={cell?.conflict ? 'Разные значения в разных процедурах' : undefined}
                  >
                    {formatCell(cell, crit)}
                    {cell?.conflict && <span className="ml-0.5 text-amber-500">*</span>}
                  </span>
                  {onEditCriterion && (
                    <button
                      type="button"
                      onClick={() => onEditCriterion(crit)}
                      className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 text-muted-foreground hover:text-foreground"
                      aria-label="Редактировать критерий"
                      title="Редактировать критерий"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
