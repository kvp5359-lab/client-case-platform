"use client"

/**
 * Редактор фильтра отчёта — плоский список условий (AND).
 *
 * Хранит FilterGroup (общий формат @/lib/filters/types), но UI намеренно
 * упрощён до одного уровня: поле → оператор → значение. Вложенные группы,
 * созданные иначе (или будущим расширением), движок run_report понимает,
 * но этот редактор их не показывает — редактирует только плоские условия.
 */

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import type { FilterCondition, FilterGroup } from '@/lib/filters/types'
import {
  getFieldDef,
  operatorsForField,
  type ReportDatasetDef,
  type ReportFieldDef,
} from '@/lib/reports/registry'
import { PERIOD_PRESET_OPTIONS } from '@/lib/reports/runtime'
import { useReportFieldOptions } from '@/hooks/useReports'

/** Пресеты для оператора «период»: без «Всё время» (нет условия) и «Период…» (это between). */
const DYN_PERIOD_OPTIONS = PERIOD_PRESET_OPTIONS.filter(
  (o) => o.value !== 'all' && o.value !== 'custom',
)

type Props = {
  workspaceId: string
  dataset: ReportDatasetDef
  value: FilterGroup | undefined
  onChange: (next: FilterGroup) => void
}

function conditionsOf(group: FilterGroup | undefined): FilterCondition[] {
  if (!group) return []
  return group.rules.filter((r): r is FilterCondition => r.type === 'condition')
}

function toGroup(conditions: FilterCondition[]): FilterGroup {
  return { logic: 'and', rules: conditions }
}

function defaultOperator(field: ReportFieldDef): string {
  return operatorsForField(field)[0]?.value ?? 'equals'
}

function defaultValue(field: ReportFieldDef, operator: string): unknown {
  if (operator === 'in' || operator === 'not_in') return []
  if (operator === 'between') return ['', '']
  if (operator === 'dyn_period') return 'this_month'
  if (field.staticOptions) return field.staticOptions[0]?.value ?? ''
  return ''
}

function ConditionValueInput({
  workspaceId,
  field,
  condition,
  onValue,
}: {
  workspaceId: string
  field: ReportFieldDef
  condition: FilterCondition
  onValue: (v: unknown) => void
}) {
  const needsOptions = !!field.optionsKind && !field.staticOptions
  const { data: options = [] } = useReportFieldOptions(
    needsOptions ? workspaceId : undefined,
    needsOptions ? field.optionsKind! : null,
  )

  if (condition.operator === 'is_null' || condition.operator === 'is_not_null') {
    return null
  }

  if (condition.operator === 'dyn_period') {
    return (
      <Select value={String(condition.value ?? 'this_month')} onValueChange={onValue}>
        <SelectTrigger className="h-8 w-[180px]">
          <SelectValue placeholder="Период" />
        </SelectTrigger>
        <SelectContent>
          {DYN_PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.staticOptions) {
    return (
      <Select value={String(condition.value ?? '')} onValueChange={onValue}>
        <SelectTrigger className="h-8 w-[180px]">
          <SelectValue placeholder="Значение" />
        </SelectTrigger>
        <SelectContent>
          {field.staticOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === 'uuid') {
    const selected = Array.isArray(condition.value) ? (condition.value as string[]) : []
    return (
      <MultiSelect
        className="w-[260px]"
        options={options}
        value={selected}
        onChange={onValue}
        placeholder="Выбрать…"
        showSearch
        maxVisibleTags={2}
      />
    )
  }

  if (condition.operator === 'between') {
    const pair = Array.isArray(condition.value) ? (condition.value as unknown[]) : ['', '']
    const inputType = field.type === 'date' ? 'date' : 'number'
    return (
      <div className="flex items-center gap-1">
        <Input
          type={inputType}
          className="h-8 w-[140px]"
          value={String(pair[0] ?? '')}
          onChange={(e) => onValue([e.target.value, pair[1] ?? ''])}
        />
        <span className="text-muted-foreground text-xs">—</span>
        <Input
          type={inputType}
          className="h-8 w-[140px]"
          value={String(pair[1] ?? '')}
          onChange={(e) => onValue([pair[0] ?? '', e.target.value])}
        />
      </div>
    )
  }

  const inputType = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'
  return (
    <Input
      type={inputType}
      className="h-8 w-[200px]"
      value={String(condition.value ?? '')}
      onChange={(e) => onValue(e.target.value)}
      placeholder="Значение"
    />
  )
}

export function ReportFilterEditor({ workspaceId, dataset, value, onChange }: Props) {
  const conditions = conditionsOf(value)

  const update = (index: number, patch: Partial<FilterCondition>) => {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c))
    onChange(toGroup(next))
  }

  const addCondition = () => {
    const field = dataset.fields[0]
    const operator = defaultOperator(field)
    onChange(
      toGroup([
        ...conditions,
        { type: 'condition', field: field.key, operator, value: defaultValue(field, operator) },
      ]),
    )
  }

  const removeCondition = (index: number) => {
    onChange(toGroup(conditions.filter((_, i) => i !== index)))
  }

  return (
    <div className="space-y-2">
      {conditions.map((cond, i) => {
        const field = getFieldDef(dataset, cond.field) ?? dataset.fields[0]
        const operators = operatorsForField(field)
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select
              value={cond.field}
              onValueChange={(fieldKey) => {
                const nextField = getFieldDef(dataset, fieldKey)
                if (!nextField) return
                const op = defaultOperator(nextField)
                update(i, { field: fieldKey, operator: op, value: defaultValue(nextField, op) })
              }}
            >
              <SelectTrigger className="h-8 w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dataset.fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={cond.operator}
              onValueChange={(op) => update(i, { operator: op, value: defaultValue(field, op) })}
            >
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operators.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ConditionValueInput
              workspaceId={workspaceId}
              field={field}
              condition={cond}
              onValue={(v) => update(i, { value: v })}
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => removeCondition(i)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button variant="outline" size="sm" onClick={addCondition}>
        <Plus className="h-4 w-4 mr-1" />
        Условие
      </Button>
    </div>
  )
}
