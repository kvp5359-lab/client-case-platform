/**
 * SearchableSelect — выбор одного значения из списка с поиском.
 *
 * Универсальный компонент: подходит для контрагентов (participants),
 * статей справочника (finance_services), записей кастомных справочников
 * и любых других списков «выбери одно из многих».
 *
 * Без поддержки мульти-выбора (для этого есть AssigneesPopover) и без
 * группировки. Если понадобится группировка — добавим параметр groupBy.
 */

"use client"

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  /** Дополнительная подпись (email, организация, цена и т.п.) — справа от label. */
  hint?: string
}

interface Props {
  options: SearchableOption[]
  /** Выбранное значение или null. */
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  /** Текст пункта «не выбрано». null → значение не сбрасывается; чтобы скрыть пункт, передай undefined. */
  noneLabel?: string | null
  emptyText?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  /** id триггера для связки с <label htmlFor>. */
  id?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Выбери…',
  noneLabel = '— Не указан —',
  emptyText = 'Ничего не нашли',
  searchPlaceholder = 'Поиск…',
  disabled,
  className,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    )
  }, [options, query])

  const handleSelect = (next: string | null) => {
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setTimeout(() => inputRef.current?.focus(), 0)
        else setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selectedLabel && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {selectedLabel ?? (value === null && noneLabel ? noneLabel : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[260px]"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
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
          {noneLabel !== undefined && noneLabel !== null && (
            <OptionRow
              selected={value === null}
              onClick={() => handleSelect(null)}
              label={noneLabel}
              muted
            />
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">{emptyText}</div>
          ) : (
            filtered.map((o) => (
              <OptionRow
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

function OptionRow({
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
