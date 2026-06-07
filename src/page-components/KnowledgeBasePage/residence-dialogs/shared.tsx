'use client'

/** Общие элементы диалогов справочника ВНЖ. */

import { cn } from '@/lib/utils'
import type { FieldType, RuleCondition } from '@/lib/residence/types'

export const FIELD_TYPE_LABELS: { value: FieldType; label: string }[] = [
  { value: 'number', label: 'Число' },
  { value: 'boolean', label: 'Да / нет' },
  { value: 'text', label: 'Текст' },
  { value: 'reference', label: 'Выбор из списка' },
]

export const NUMBER_OPS: { value: RuleCondition['operator']; label: string }[] = [
  { value: '>=', label: '≥ не меньше' },
  { value: '<=', label: '≤ не больше' },
  { value: '>', label: '> больше' },
  { value: '<', label: '< меньше' },
  { value: '=', label: '= равно' },
]

/** Выбор важности тегами с цветовым кодированием. */
export function SeverityPicker({
  value, onChange,
}: {
  value: RuleCondition['severity']
  onChange: (v: RuleCondition['severity']) => void
}) {
  const v = value ?? 'important'
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('critical')}
        className={cn(
          'rounded-full border px-3 py-1 text-xs transition-colors',
          v === 'critical'
            ? 'border-red-500 bg-red-500 text-white'
            : 'border-red-300 text-red-600 hover:bg-red-50',
        )}
      >
        Критично
      </button>
      <button
        type="button"
        onClick={() => onChange('important')}
        className={cn(
          'rounded-full border px-3 py-1 text-xs transition-colors',
          v === 'important'
            ? 'border-amber-500 bg-amber-500 text-white'
            : 'border-amber-300 text-amber-600 hover:bg-amber-50',
        )}
      >
        Желательно
      </button>
    </div>
  )
}
