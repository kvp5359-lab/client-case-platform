/**
 * InlineEditCell — редактируемая ячейка таблицы (текст / число / дата).
 *
 * Поведение:
 *   - В режиме показа выводит value как текст; при ховере — лёгкая подсветка
 *     и курсор-pointer, намекая на возможность клика.
 *   - Клик переключает в режим редактирования (input занимает место текста).
 *   - Enter или blur → onCommit(value) (пустое значение для type='text'
 *     передаётся как ''; для number — как null если пусто, иначе число).
 *   - Esc → откат, без сохранения.
 *   - Если onCommit упадёт — компонент не управляет состоянием ошибки;
 *     родитель сам должен показать toast и инвалидировать данные.
 */

"use client"

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type FieldType = 'text' | 'number' | 'date'

interface BaseProps {
  /** Подпись для пустого значения (по умолчанию «—»). */
  emptyText?: string
  /** Disable редактирование. */
  disabled?: boolean
  /** Выравнивание текста. */
  align?: 'left' | 'right' | 'center'
  /** Доп. классы. */
  className?: string
  /** Превратить значение в строку для отображения (форматирование). */
  format?: (value: string | number | null) => string
  /** placeholder в редакторе. */
  placeholder?: string
}

interface TextProps extends BaseProps {
  type: 'text'
  value: string
  onCommit: (next: string) => void
}

interface NumberProps extends BaseProps {
  type: 'number'
  value: number | null
  onCommit: (next: number) => void
  /** Минимум для number-инпута. По умолчанию 0. */
  min?: number
  /** Шаг для number-инпута. По умолчанию 0.01. */
  step?: number | string
}

interface DateProps extends BaseProps {
  type: 'date'
  /** ISO YYYY-MM-DD. */
  value: string
  onCommit: (next: string) => void
}

type Props = TextProps | NumberProps | DateProps

const ALIGN_CLASS: Record<NonNullable<BaseProps['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function InlineEditCell(props: Props) {
  const {
    emptyText = '—',
    disabled,
    align = 'left',
    className,
    format,
    placeholder,
  } = props

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(toEditableString(props))
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Синхронизация draft при смене value снаружи (например, после optimistic update).
  useEffect(() => {
    if (!editing) setDraft(toEditableString(props))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = () => {
    if (disabled) return
    setDraft(toEditableString(props))
    setEditing(true)
  }

  const commit = () => {
    if (!editing) return
    const original = toEditableString(props)
    setEditing(false)
    if (draft === original) return // ничего не поменялось

    if (props.type === 'number') {
      const parsed = Number(draft.replace(',', '.'))
      if (!Number.isFinite(parsed)) return
      props.onCommit(parsed)
    } else {
      // text / date
      props.onCommit(draft)
    }
  }

  const cancel = () => {
    setEditing(false)
    setDraft(toEditableString(props))
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  const displayValue = (() => {
    if (format) return format(props.value as never)
    if (props.value == null || props.value === '') return emptyText
    if (props.type === 'date') return formatDate(props.value)
    return String(props.value)
  })()

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={inputType(props.type)}
        value={draft}
        placeholder={placeholder}
        min={props.type === 'number' ? (props.min ?? 0) : undefined}
        step={props.type === 'number' ? (props.step ?? '0.01') : undefined}
        inputMode={props.type === 'number' ? 'decimal' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className={cn(
          'w-full bg-white border border-amber-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-amber-200 text-sm tabular-nums',
          ALIGN_CLASS[align],
          className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={cn(
        'w-full text-sm rounded px-2 py-1 -mx-2 -my-1 truncate',
        ALIGN_CLASS[align],
        disabled
          ? 'cursor-default text-gray-700'
          : 'hover:bg-gray-100 cursor-text',
        // Полупрозрачный текст при пустом значении.
        (props.value == null || props.value === '') && 'text-gray-400',
        className,
      )}
    >
      {displayValue}
    </button>
  )
}

// ---- helpers ----

function toEditableString(props: Props): string {
  const v = props.value
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  return v
}

function inputType(t: FieldType): string {
  if (t === 'number') return 'number'
  if (t === 'date') return 'date'
  return 'text'
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}
