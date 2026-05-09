/**
 * InlineEditSelect — редактируемая ячейка-селект таблицы.
 * Дисплей-режим: показывает label выбранной опции (или emptyText).
 * Клик → попап со списком и поиском (на базе SearchableSelect).
 */

"use client"

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Search, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SearchableOption } from './searchable-select'

interface Props {
  options: SearchableOption[]
  value: string | null
  onCommit: (next: string | null) => void
  /** Текст в ячейке, когда значение пустое (по умолчанию «—»). */
  emptyText?: string
  /** Текст пункта «не выбрано» в попапе. null/undefined — пункт скрыт. */
  noneLabel?: string | null
  searchPlaceholder?: string
  popoverEmpty?: string
  disabled?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
}

const ALIGN_CLASS: Record<NonNullable<Props['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function InlineEditSelect({
  options,
  value,
  onCommit,
  emptyText = '—',
  noneLabel = '— Не указан —',
  searchPlaceholder = 'Поиск…',
  popoverEmpty = 'Ничего не нашли',
  disabled,
  align = 'left',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find((o) => o.value === value)
  const displayValue = selected?.label ?? emptyText
  const isEmpty = !selected

  const filtered = (() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    )
  })()

  const handleSelect = (next: string | null) => {
    setOpen(false)
    setQuery('')
    if (next !== value) onCommit(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-full text-sm rounded px-2 py-1 -mx-2 -my-1 truncate',
            ALIGN_CLASS[align],
            disabled
              ? 'cursor-default text-gray-700'
              : 'hover:bg-gray-100 cursor-pointer',
            isEmpty && 'text-gray-400',
            className,
          )}
        >
          {displayValue}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[260px]"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setQuery('')}
              aria-label="Очистить"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {noneLabel != null && (
            <Row
              selected={value === null}
              onClick={() => handleSelect(null)}
              label={noneLabel}
              muted
            />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">{popoverEmpty}</div>
          ) : (
            filtered.map((o) => (
              <Row
                key={o.value}
                selected={o.value === value}
                onClick={() => handleSelect(o.value)}
                label={o.label}
                hint={o.hint}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Row({
  selected,
  onClick,
  label,
  hint,
  muted,
}: {
  selected: boolean
  onClick: () => void
  label: string
  hint?: string
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100',
        selected && 'bg-gray-50',
        muted && 'text-gray-500 italic',
      )}
    >
      <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-gray-400 shrink-0">{hint}</span>}
    </button>
  )
}
