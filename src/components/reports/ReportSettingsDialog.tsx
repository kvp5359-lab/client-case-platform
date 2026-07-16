"use client"

/**
 * Настройки отчёта (модель Планфикса): колонки — ядро, группировка вешается на
 * поле колонки, отдельных «показателей» нет — агрегат задаётся у колонки
 * («При группировке выводить»).
 *
 * Монтируется только открытым (state инициализируется от report при открытии).
 */

import { useState } from 'react'
import { AlignLeft, AlignRight, GripVertical, X } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ReportColumn,
  ReportColumnAgg,
  ReportConfig,
  ReportDefinition,
  ReportGroupBy,
} from '@/types/reports'
import {
  AGG_LABELS,
  aggsForField,
  getDatasetDef,
  getFieldDef,
  GRANULARITY_OPTIONS,
  type ReportDatasetDef,
} from '@/lib/reports/registry'
import { normalizeReportConfig } from '@/lib/reports/runtime'
import { ReportFilterEditor } from './ReportFilterEditor'

const NONE = '__none__'

/** Строка колонки: drag + заголовок + агрегат + выравнивание + удаление. */
function SortableColumnRow({
  id,
  column,
  dataset,
  isGrouped,
  onChange,
  onRemove,
  removable,
}: {
  id: string
  column: ReportColumn
  dataset: ReportDatasetDef
  isGrouped: boolean
  onChange: (patch: Partial<ReportColumn>) => void
  onRemove: () => void
  removable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const field = getFieldDef(dataset, column.key)
  const agg = column.agg ?? 'none'
  const align = column.align ?? (field?.type === 'number' ? 'right' : 'left')

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 ${
        isDragging ? 'opacity-60 z-10 relative' : ''
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-muted-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Input
        className="h-7 w-[150px] text-sm"
        value={column.label ?? ''}
        placeholder={field?.label ?? column.key}
        onChange={(e) => onChange({ label: e.target.value || undefined })}
      />

      {isGrouped ? (
        <span className="text-xs text-muted-foreground flex-1 px-1">
          по этой колонке группируем
        </span>
      ) : (
        <Select
          value={agg}
          onValueChange={(v) => onChange({ agg: v as ReportColumnAgg })}
        >
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field ? aggsForField(field) : (['none', 'count'] as ReportColumnAgg[])).map((a) => (
              <SelectItem key={a} value={a}>{AGG_LABELS[a]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground shrink-0"
        title={align === 'right' ? 'Выравнивание: справа' : 'Выравнивание: слева'}
        onClick={() => onChange({ align: align === 'right' ? 'left' : 'right' })}
      >
        {align === 'right' ? <AlignRight className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground shrink-0"
        disabled={!removable}
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

type Props = {
  workspaceId: string
  report: ReportDefinition
  onClose: () => void
  onSave: (name: string, config: ReportConfig) => void
  saving: boolean
}

export function ReportSettingsDialog({ workspaceId, report, onClose, onSave, saving }: Props) {
  const dataset = getDatasetDef(report.config.dataset)
  const [name, setName] = useState(report.name)
  const [config, setConfig] = useState<ReportConfig>(() => normalizeReportConfig(report.config))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  if (!dataset) return null

  const groupableFields = dataset.fields.filter((f) => f.groupable)
  const columns = config.columns
  /** id строки: key+index — поле может повторяться (Сумма и Среднее). */
  const rowId = (col: ReportColumn, i: number) => `${col.key}#${i}`

  /**
   * Структурные изменения колонок (добавить/удалить/переставить). Сортировка
   * ссылается на колонку по индексу, поэтому её надо переехать вместе с
   * колонкой (объект тот же) либо сбросить, если колонку удалили.
   */
  const setColumns = (next: ReportColumn[]) => {
    let sort = config.sort
    if (sort && /^c\d+$/.test(sort.by)) {
      const prevCol = columns[Number(sort.by.slice(1))]
      const ni = prevCol ? next.indexOf(prevCol) : -1
      sort = ni >= 0 ? { ...sort, by: `c${ni}` } : undefined
    }
    setConfig({ ...config, columns: next, sort })
  }

  /** Правка атрибутов колонки — порядок не меняется, сортировку не трогаем. */
  const patchColumn = (i: number, patch: Partial<ReportColumn>) =>
    setConfig({ ...config, columns: columns.map((c, ci) => (ci === i ? { ...c, ...patch } : c)) })

  /**
   * Группировка возможна только по колонке — если её нет, добавляем, иначе
   * значение группы негде показать (и появится пустая колонка, как раньше).
   */
  const setGroupAt = (index: number, fieldKey: string | null) => {
    const next: ReportGroupBy[] = config.groupBy.slice(0, index)
    if (fieldKey) {
      const field = getFieldDef(dataset, fieldKey)
      next.push({
        field: fieldKey,
        ...(field?.type === 'date' ? { granularity: 'month' as const } : {}),
      })
      for (const g of config.groupBy.slice(index + 1)) {
        if (g.field !== fieldKey && next.length < 3) next.push(g)
      }
    }
    let cols = columns
    for (const g of next) {
      if (!cols.some((c) => c.key === g.field)) {
        // Колонку группировки ставим перед остальными — читается как дерево.
        cols = [{ key: g.field }, ...cols]
      }
    }
    // У колонки группировки агрегата быть не может — там значение группы.
    cols = cols.map((c) => (next.some((g) => g.field === c.key) ? { ...c, agg: undefined } : c))
    setConfig({ ...config, groupBy: next, columns: cols, sort: undefined })
  }

  const setGranularity = (index: number, granularity: ReportGroupBy['granularity']) => {
    setConfig({
      ...config,
      groupBy: config.groupBy.map((g, i) => (i === index ? { ...g, granularity } : g)),
    })
  }

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = columns.map(rowId)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    setColumns(arrayMove(columns, from, to))
  }

  const addColumn = (key: string) => setColumns([...columns, { key }])

  const showRecords = config.showRecords ?? false
  const hasGroups = config.groupBy.length > 0
  const hasAgg = columns.some((c) => (c.agg ?? 'none') !== 'none')
  const viewHint = hasGroups
    ? showRecords
      ? 'Группы с агрегатами; записи внутри группы догружаются по клику на неё.'
      : 'Только строки групп с агрегатами.'
    : showRecords
      ? 'Группировок нет — отчёт будет плоским списком записей.'
      : 'Группировок нет и записи скрыты — отчёт покажет одну строку с итогами.'
  // Нечего показывать: ни записей, ни агрегатов.
  const nothingToShow = !showRecords && !hasAgg

  // Селекты уровней группировки: уровень N показывается, если задан N-1.
  const groupSlots = Math.min(config.groupBy.length + 1, 3)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки отчёта</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Группировка и сортировка — рядом: обе про порядок строк. */}
          <div className="flex gap-10">
            <div className="space-y-1.5">
              <Label>Группировка</Label>
              <div className="space-y-2">
                {Array.from({ length: groupSlots }).map((_, i) => {
                  const current = config.groupBy[i]
                  const field = current ? getFieldDef(dataset, current.field) : null
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">
                        Уровень {i + 1}
                      </span>
                      <Select
                        value={current?.field ?? NONE}
                        onValueChange={(v) => setGroupAt(i, v === NONE ? null : v)}
                      >
                        <SelectTrigger className="h-8 w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— нет —</SelectItem>
                          {groupableFields.map((f) => (
                            <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field?.type === 'date' && current && (
                        <Select
                          value={current.granularity ?? 'month'}
                          onValueChange={(v) => setGranularity(i, v as ReportGroupBy['granularity'])}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GRANULARITY_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )
                })}
            </div>
            </div>

            <div className="w-[210px] space-y-1.5">
              <Label>Сортировка</Label>
              <Select
                value={config.sort?.by ?? NONE}
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    sort: v === NONE ? undefined : { by: v, dir: config.sort?.dir ?? 'asc' },
                  })
                }
              >
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— по умолчанию —</SelectItem>
                  {columns.map((col, i) => (
                    <SelectItem key={`c${i}`} value={`c${i}`}>
                      {col.label || getFieldDef(dataset, col.key)?.label || col.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {config.sort && (
                <Select
                  value={config.sort.dir}
                  onValueChange={(v) =>
                    setConfig({ ...config, sort: { by: config.sort!.by, dir: v as 'asc' | 'desc' } })
                  }
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">по возрастанию</SelectItem>
                    <SelectItem value="desc">по убыванию</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                {hasGroups ? 'Порядок групп и записей внутри них.' : 'Порядок записей.'}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Колонки</Label>
            <p className="text-xs text-muted-foreground">
              Порядок = порядок в таблице. Заголовок можно переименовать, второй
              список — что колонка показывает в строке группы.
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <SortableContext items={columns.map(rowId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {columns.map((col, i) => (
                    <SortableColumnRow
                      key={rowId(col, i)}
                      id={rowId(col, i)}
                      column={col}
                      dataset={dataset}
                      isGrouped={config.groupBy.some((g) => g.field === col.key)}
                      onChange={(patch) => patchColumn(i, patch)}
                      onRemove={() => setColumns(columns.filter((_, ci) => ci !== i))}
                      removable={
                        columns.length > 1 && !config.groupBy.some((g) => g.field === col.key)
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <Select value="" onValueChange={addColumn}>
              <SelectTrigger className="h-8 w-[220px]">
                <SelectValue placeholder="+ Добавить колонку" />
              </SelectTrigger>
              <SelectContent>
                {dataset.fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={showRecords}
                onCheckedChange={() => setConfig({ ...config, showRecords: !showRecords })}
              />
              Показывать сами записи
            </label>
            <p className="text-xs text-muted-foreground">{viewHint}</p>
            {nothingToShow && (
              <p className="text-xs text-destructive">
                Включи показ записей или задай хотя бы одной колонке, что выводить
                при группировке, — иначе в отчёте нечего показывать.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Фильтр</Label>
            <ReportFilterEditor
              workspaceId={workspaceId}
              dataset={dataset}
              value={config.filter}
              onChange={(filter) => setConfig({ ...config, filter })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => onSave(name.trim() || report.name, config)}
            disabled={saving || nothingToShow}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
