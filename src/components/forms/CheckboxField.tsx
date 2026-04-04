"use client"

/**
 * CheckboxField — кнопки «Да» / «Нет» для полей типа checkbox.
 *
 * Используется в FieldInput и SimpleInput. Логика отображения и переключения
 * вынесена сюда, чтобы избежать дублирования.
 */

import { cn } from '@/lib/utils'

export interface CheckboxFieldProps {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  /** Вызывается сразу после изменения значения (для немедленного сохранения) */
  onSave?: (newValue: string) => void
}

export function CheckboxField({ value, disabled = false, onChange, onSave }: CheckboxFieldProps) {
  const isTrue = value === 'true'
  const isFalse = value === 'false'

  const handleClick = (target: 'true' | 'false') => {
    const current = target === 'true' ? isTrue : isFalse
    const newValue = current ? '' : target
    onChange(newValue)
    onSave?.(newValue)
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleClick('true')}
        disabled={disabled}
        className={cn(
          'px-3 py-0.5 rounded-md text-xs font-medium transition-colors',
          isTrue ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        Да
      </button>
      <button
        type="button"
        onClick={() => handleClick('false')}
        disabled={disabled}
        className={cn(
          'px-3 py-0.5 rounded-md text-xs font-medium transition-colors',
          isFalse ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        Нет
      </button>
    </div>
  )
}
