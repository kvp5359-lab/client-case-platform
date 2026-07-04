"use client"

/**
 * Настройки отчёта: название, режим (сводка/список), группировки,
 * показатели, колонки списка, фильтр. Монтируется только открытым
 * (state инициализируется от report при каждом открытии).
 */

import { useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
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
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import type { ReportConfig, ReportDefinition, ReportGroupBy } from '@/types/reports'
import {
  getDatasetDef,
  getFieldDef,
  GRANULARITY_OPTIONS,
} from '@/lib/reports/registry'
import { ReportFilterEditor } from './ReportFilterEditor'

const NONE = '__none__'

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
  const [config, setConfig] = useState<ReportConfig>(report.config)

  if (!dataset) return null

  const groupableFields = dataset.fields.filter((f) => f.groupable)

  const setGroupAt = (index: number, fieldKey: string | null) => {
    const next: ReportGroupBy[] = config.groupBy.slice(0, index)
    if (fieldKey) {
      const field = getFieldDef(dataset, fieldKey)
      next.push({
        field: fieldKey,
        ...(field?.type === 'date' ? { granularity: 'month' as const } : {}),
      })
      // Сохраняем более глубокие уровни, если они не дублируют выбранное поле.
      for (const g of config.groupBy.slice(index + 1)) {
        if (g.field !== fieldKey && next.length < 3) next.push(g)
      }
    }
    setConfig({ ...config, groupBy: next, sort: undefined })
  }

  const setGranularity = (index: number, granularity: ReportGroupBy['granularity']) => {
    setConfig({
      ...config,
      groupBy: config.groupBy.map((g, i) => (i === index ? { ...g, granularity } : g)),
    })
  }

  const toggleMeasure = (key: string) => {
    const has = config.measures.includes(key)
    const measures = has
      ? config.measures.filter((m) => m !== key)
      : [...config.measures, key]
    setConfig({ ...config, measures, sort: undefined })
  }

  // Колонки режима «Список» — упорядоченный список (порядок = порядок в таблице).
  const activeColumns = config.columns && config.columns.length > 0
    ? config.columns
    : dataset.detailDefault

  const setColumns = (columns: string[]) => setConfig({ ...config, columns })

  const moveColumn = (index: number, delta: -1 | 1) => {
    const next = [...activeColumns]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setColumns(next)
  }

  const removeColumn = (key: string) => {
    if (activeColumns.length <= 1) return
    setColumns(activeColumns.filter((c) => c !== key))
  }

  const addColumn = (key: string) => setColumns([...activeColumns, key])

  const availableColumns = dataset.fields.filter((f) => !activeColumns.includes(f.key))

  // Селекты уровней группировки: уровень N показывается, если задан уровень N-1.
  const groupSlots = Math.min(config.groupBy.length + 1, 3)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки отчёта</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Вид</Label>
            <SegmentedToggle
              value={config.mode}
              onChange={(mode) => setConfig({ ...config, mode: mode as ReportConfig['mode'] })}
              options={[
                { value: 'summary', label: 'Сводка' },
                { value: 'detail', label: 'Список' },
              ]}
            />
          </div>

          {config.mode === 'summary' ? (
            <>
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

              <div className="space-y-1.5">
                <Label>Показатели</Label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {dataset.measures.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={config.measures.includes(m.key)}
                        onCheckedChange={() => toggleMeasure(m.key)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>Колонки (порядок = порядок в таблице)</Label>
              <div className="space-y-1">
                {activeColumns.map((key, i) => {
                  const field = getFieldDef(dataset, key)
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1"
                    >
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                        {i + 1}.
                      </span>
                      <span className="text-sm flex-1 truncate">{field?.label ?? key}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={i === 0}
                        onClick={() => moveColumn(i, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={i === activeColumns.length - 1}
                        onClick={() => moveColumn(i, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        disabled={activeColumns.length <= 1}
                        onClick={() => removeColumn(key)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
              {availableColumns.length > 0 && (
                <Select value="" onValueChange={addColumn}>
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="+ Добавить колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableColumns.map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

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
            disabled={saving || (config.mode === 'summary' && config.measures.length === 0)}
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
