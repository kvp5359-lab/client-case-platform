"use client"

import { useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'

/** Относительные пресеты дат */
const DATE_PRESETS = [
  { value: '__today__', label: 'Сегодня' },
  { value: '__yesterday__', label: 'Вчера' },
  { value: '__tomorrow__', label: 'Завтра' },
  { value: '_sep1_', label: '---' },
  { value: '__this_week__', label: 'Текущая неделя' },
  { value: '__last_week__', label: 'Прошлая неделя' },
  { value: '__next_week__', label: 'Следующая неделя' },
  { value: '_sep2_', label: '---' },
  { value: '__this_month__', label: 'Текущий месяц' },
  { value: '__last_month__', label: 'Прошлый месяц' },
  { value: '__next_month__', label: 'Следующий месяц' },
  { value: '_sep3_', label: '---' },
  { value: '__last_n_days__', label: 'Последние … дней' },
  { value: '__next_n_days__', label: 'Следующие … дней' },
  { value: '_sep4_', label: '---' },
  { value: '__custom__', label: 'Дата...' },
] as const

function isPreset(v: unknown): boolean {
  if (typeof v !== 'string') return false
  return v.startsWith('__') && v.endsWith('__')
}

/** __last_n_days:7__ → { type: 'last_n_days', n: 7 } */
function parseDynamic(v: unknown): { type: string; n: number } | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^__(\w+):(\d+)__$/)
  if (!m) return null
  return { type: m[1], n: parseInt(m[2], 10) }
}

function getDisplayValue(v: unknown): string {
  if (!v) return ''
  const dyn = parseDynamic(v)
  if (dyn) {
    if (dyn.type === 'last_n_days') return `Послед. ${dyn.n} дн.`
    if (dyn.type === 'next_n_days') return `След. ${dyn.n} дн.`
  }
  const preset = DATE_PRESETS.find((p) => p.value === v)
  if (preset) return preset.label
  return ''
}

interface FilterDateValueProps {
  operator: string
  value: unknown
  onChange: (value: unknown) => void
}

function parseToDate(v: unknown): Date | undefined {
  if (!v || typeof v !== 'string' || v.startsWith('__')) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d
}

function toISODate(d: Date | undefined): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function DatePresetOrPicker({
  value,
  onChange,
  placeholder = 'дата',
}: {
  value: unknown
  onChange: (v: unknown) => void
  placeholder?: string
}) {
  const dyn = parseDynamic(value)
  const isStaticPreset = isPreset(value) && !dyn
  const isDynPreset = !!dyn
  const isDate = typeof value === 'string' && !value.startsWith('__') && value.length > 0
  const showPicker = isDate || value === '__custom__'
  const date = useMemo(() => parseToDate(value), [value])

  // Режим ввода дней
  const [nDaysMode, setNDaysMode] = useState<'last_n_days' | 'next_n_days' | null>(
    dyn?.type === 'last_n_days' ? 'last_n_days' : dyn?.type === 'next_n_days' ? 'next_n_days' : null,
  )
  const [nDays, setNDays] = useState(dyn?.n?.toString() ?? '')

  // Определяем select value
  let selectValue = ''
  if (nDaysMode === 'last_n_days') selectValue = '__last_n_days__'
  else if (nDaysMode === 'next_n_days') selectValue = '__next_n_days__'
  else if (isDynPreset && dyn.type === 'last_n_days') selectValue = '__last_n_days__'
  else if (isDynPreset && dyn.type === 'next_n_days') selectValue = '__next_n_days__'
  else if (isStaticPreset) selectValue = value as string
  else if (showPicker) selectValue = '__custom__'

  return (
    <div className="flex items-center gap-1">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === '__custom__') {
            setNDaysMode(null)
            onChange(null)
          } else if (v === '__last_n_days__') {
            setNDaysMode('last_n_days')
            setNDays('')
            onChange(null)
          } else if (v === '__next_n_days__') {
            setNDaysMode('next_n_days')
            setNDays('')
            onChange(null)
          } else {
            setNDaysMode(null)
            onChange(v)
          }
        }}
      >
        <SelectTrigger className="h-8 text-xs min-w-[140px]">
          {isDynPreset ? (
            <span>{getDisplayValue(value)}</span>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) =>
            p.value.startsWith('_sep') ? (
              <SelectSeparator key={p.value} />
            ) : (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>

      {/* Ввод количества дней */}
      {(nDaysMode || isDynPreset) && (
        <Input
          className="h-8 text-xs w-[60px]"
          type="number"
          min={1}
          placeholder="дн."
          value={nDays}
          onChange={(e) => {
            const val = e.target.value
            setNDays(val)
            const n = parseInt(val, 10)
            const mode = nDaysMode ?? dyn?.type
            if (n > 0 && mode) {
              onChange(`__${mode}:${n}__`)
            }
          }}
          autoFocus
        />
      )}

      {/* Date picker */}
      {showPicker && !nDaysMode && (
        <div className="h-8 flex items-center rounded-md border px-2 text-xs min-w-[120px]">
          <DatePicker
            date={date}
            onDateChange={(d) => onChange(toISODate(d))}
            placeholder="ДД.ММ.ГГГГ"
          />
        </div>
      )}
    </div>
  )
}

export function FilterDateValue({ operator, value, onChange }: FilterDateValueProps) {
  if (operator === 'between') {
    const arr = Array.isArray(value) ? value : [null, null]

    return (
      <div className="flex items-center gap-1">
        <DatePresetOrPicker
          value={arr[0]}
          onChange={(v) => onChange([v, arr[1]])}
          placeholder="от"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <DatePresetOrPicker
          value={arr[1]}
          onChange={(v) => onChange([arr[0], v])}
          placeholder="до"
        />
      </div>
    )
  }

  return (
    <DatePresetOrPicker value={value} onChange={onChange} />
  )
}
