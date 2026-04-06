"use client"

/**
 * SimpleInput — базовый инпут для FormStepper
 * Поддерживает различные типы полей: text, email, phone, textarea, number, date, checkbox, select
 * Рендерится внутри FloatingField без собственных обёрток
 */

import { memo, useRef, useCallback, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { parseDateString, formatDateToString } from '@/utils/format/dateFormat'
import { CheckboxField } from './CheckboxField'
import type { FieldType } from './types'

export interface SelectOption {
  id: string
  value: string
  label: string
  color: string | null
  order_index: number
}

export interface SimpleInputProps {
  fieldType: FieldType
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onBlur: () => void
  onSaveWithValue?: (value: string) => void
  selectOptions?: SelectOption[]
}

// Высота 2.5 строк текста (line-height 20px × 2.5 = 50px)
const COLLAPSED_HEIGHT = 50

const AutoGrowTextarea = memo(function AutoGrowTextarea({
  value,
  onChange,
  onBlur,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  disabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const isFocusedRef = useRef(false)

  const collapse = useCallback(() => {
    const el = ref.current
    if (el) el.style.height = COLLAPSED_HEIGHT + 'px'
  }, [])

  const expand = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const scrollH = el.scrollHeight
    el.style.height = Math.max(scrollH, COLLAPSED_HEIGHT) + 'px'
  }, [])

  // При первом рендере и при смене value без фокуса — схлопываем
  useEffect(() => {
    if (!isFocusedRef.current) collapse()
  }, [value, collapse])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
        if (isFocusedRef.current) expand()
      }}
      onFocus={() => {
        isFocusedRef.current = true
        expand()
      }}
      onBlur={() => {
        isFocusedRef.current = false
        collapse()
        onBlur()
      }}
      disabled={disabled}
      style={{ height: COLLAPSED_HEIGHT }}
      className="w-full border-0 bg-transparent p-0 resize-none text-sm leading-5 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden"
    />
  )
})

export const SimpleInput = memo(function SimpleInput({
  fieldType,
  value,
  disabled,
  onChange,
  onBlur,
  onSaveWithValue,
  selectOptions = [],
}: SimpleInputProps) {
  switch (fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <input
          type={fieldType === 'email' ? 'email' : fieldType === 'phone' ? 'tel' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          className="w-full border-0 bg-transparent p-0 text-sm text-foreground placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      )

    case 'textarea':
      return (
        <AutoGrowTextarea value={value} onChange={onChange} onBlur={onBlur} disabled={disabled} />
      )

    case 'number':
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          className="w-full border-0 bg-transparent p-0 text-sm text-foreground placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      )

    case 'date': {
      return (
        <DatePicker
          date={parseDateString(value)}
          onDateChange={(date) => {
            const formatted = formatDateToString(date)
            onChange(formatted)
            onSaveWithValue?.(formatted)
          }}
          placeholder=""
          disabled={disabled}
        />
      )
    }

    case 'checkbox':
      return (
        <CheckboxField
          value={value}
          disabled={disabled}
          onChange={onChange}
          onSave={onSaveWithValue}
        />
      )

    case 'select': {
      const EMPTY = '__EMPTY__'
      return (
        <Select
          value={value || EMPTY}
          onValueChange={(nv) => {
            const val = nv === EMPTY ? '' : nv
            onChange(val)
            onSaveWithValue?.(val)
          }}
          disabled={disabled}
        >
          <SelectTrigger
            className={`h-auto px-0 py-0 border-0 bg-transparent shadow-none text-sm font-normal focus:ring-0 focus:outline-none w-full [&>svg]:ml-auto ${!value ? '[&>span:first-child]:invisible' : ''}`}
          >
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY}>— Не выбрано</SelectItem>
            {selectOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          className="w-full border-0 bg-transparent p-0 text-sm text-foreground placeholder:text-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      )
  }
})
