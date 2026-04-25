"use client"

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { getFieldsForEntity, getFieldDef } from './filterDefinitions'
import { FilterValueSelect } from './FilterValueSelect'
import { FilterDateValue } from './FilterDateValue'
import { OPERATOR_LABELS } from '../types'
import type { FilterCondition } from '../types'

/** Поля, для которых доступен мультиселект с опциями */
const SELECTABLE_FIELDS = new Set(['status_id', 'status', 'type', 'created_by', 'assignees', 'participants'])

interface FilterRuleRowProps {
  condition: FilterCondition
  onChange: (updated: FilterCondition) => void
  onRemove: () => void
  entityType: 'task' | 'project'
  workspaceId: string
}

/** Операторы, для которых не нужно поле значения */
const NO_VALUE_OPERATORS = new Set(['is_null', 'is_not_null', 'today', 'this_week', 'overdue'])

export function FilterRuleRow({ condition, onChange, onRemove, entityType, workspaceId }: FilterRuleRowProps) {
  const fields = getFieldsForEntity(entityType)
  const fieldDef = getFieldDef(entityType, condition.field)
  const operators = fieldDef?.operators ?? ['equals']
  const needsValue = !NO_VALUE_OPERATORS.has(condition.operator)

  // Самовосстановление старых фильтров: для boolean-полей UI отображает «Да»
  // при value=null через fallback `?? 'true'`, но в движке actual===null даёт
  // false, и фильтр молча ничего не показывает. Подменяем null → true один раз.
  useEffect(() => {
    if (fieldDef?.type === 'boolean' && condition.value == null) {
      onChange({ ...condition, value: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDef?.type, condition.value])

  const handleFieldChange = (field: string) => {
    const newDef = getFieldDef(entityType, field)
    const newOp = newDef?.operators[0] ?? 'equals'
    // Для boolean-полей выставляем дефолт `true` сразу, чтобы синхронизировать
    // значение с UI (которое визуально показывает «Да» при value=null через
    // `String(condition.value ?? 'true')`). Иначе в движке actual===null и
    // фильтр не пропускает ни одну запись, хотя в UI он «включён» на «Да».
    const defaultValue: unknown = newDef?.type === 'boolean' ? true : null
    onChange({ ...condition, field, operator: newOp, value: defaultValue })
  }

  const handleOperatorChange = (operator: string) => {
    onChange({ ...condition, operator, value: NO_VALUE_OPERATORS.has(operator) ? null : condition.value })
  }

  const handleValueChange = (value: string) => {
    // Для множественных операторов (in, not_in) — парсим CSV
    if (condition.operator === 'in' || condition.operator === 'not_in') {
      const arr = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      onChange({ ...condition, value: arr })
    } else if (fieldDef?.type === 'boolean') {
      onChange({ ...condition, value: value === 'true' })
    } else {
      onChange({ ...condition, value })
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Field */}
      <Select value={condition.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="h-8 text-xs w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator */}
      <Select value={condition.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="h-8 text-xs w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op] ?? op}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value */}
      {needsValue && (
        <>
          {fieldDef?.type === 'boolean' ? (
            <Select
              value={String(condition.value ?? 'true')}
              onValueChange={handleValueChange}
            >
              <SelectTrigger className="h-8 text-xs w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Да</SelectItem>
                <SelectItem value="false">Нет</SelectItem>
              </SelectContent>
            </Select>
          ) : fieldDef?.type === 'date' ? (
            <FilterDateValue
              operator={condition.operator}
              value={condition.value}
              onChange={(val) => onChange({ ...condition, value: val })}
            />
          ) : fieldDef && SELECTABLE_FIELDS.has(condition.field) ? (
            <FilterValueSelect
              fieldDef={fieldDef}
              value={condition.value}
              onChange={(arr) => {
                const isJunction = fieldDef?.type === 'junction'
                let op = condition.operator
                // Junction-поля: всегда 'in' (движок не поддерживает 'equals' для junction)
                if (isJunction) {
                  if (op === 'equals') op = 'in'
                } else {
                  // Обычные поля: авто-переключение equals ↔ in
                  if (arr.length > 1 && op === 'equals') op = 'in'
                  if (arr.length <= 1 && op === 'in') op = 'equals'
                }
                // Junction и in/not_in → всегда массив; equals с 1 элементом → строка
                const val = !isJunction && arr.length === 1 && op === 'equals' ? arr[0] : arr
                onChange({ ...condition, operator: op, value: val })
              }}
              workspaceId={workspaceId}
              entityType={entityType}
            />
          ) : (
            <Input
              className="h-8 text-xs flex-1 min-w-[100px]"
              placeholder={
                fieldDef?.supportsMe
                  ? '__me__ или UUID'
                  : condition.operator === 'in' || condition.operator === 'not_in'
                    ? 'значения через ,'
                    : 'значение'
              }
              value={
                Array.isArray(condition.value)
                  ? (condition.value as string[]).join(', ')
                  : String(condition.value ?? '')
              }
              onChange={(e) => handleValueChange(e.target.value)}
            />
          )}
        </>
      )}

      {/* Remove */}
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
