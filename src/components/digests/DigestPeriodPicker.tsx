"use client"

/**
 * Пикер периода для Дневника проекта.
 *
 * Две даты (start + end) + кнопка с выпадающим списком пресетов
 * («Сегодня», «Вчера», «Прошлая неделя» и т.п.). Пресет автозаполняет обе даты.
 *
 * Для одного дня start = end. Тип периода (day/custom) вычисляется снаружи через
 * digestTypeForPeriod() из @/lib/digestDefaults.
 */

import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DIGEST_PRESETS, type DigestPeriod } from '@/lib/digestDefaults'

interface Props {
  value: DigestPeriod
  onChange: (next: DigestPeriod) => void
  /** Максимально допустимая дата окончания (обычно — сегодня по Мадриду). */
  max?: string
  className?: string
}

export function DigestPeriodPicker({ value, onChange, max, className }: Props) {
  const handleStart = (start: string) => {
    // если start позже end — выровнять end
    onChange({ start, end: start > value.end ? start : value.end })
  }
  const handleEnd = (end: string) => {
    onChange({ start: end < value.start ? end : value.start, end })
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <Input
        type="date"
        value={value.start}
        max={max}
        onChange={(e) => handleStart(e.target.value)}
        className="h-8 w-[140px]"
        aria-label="Начало периода"
      />
      <span className="text-gray-400 text-sm">—</span>
      <Input
        type="date"
        value={value.end}
        max={max}
        onChange={(e) => handleEnd(e.target.value)}
        className="h-8 w-[140px]"
        aria-label="Конец периода"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8" title="Быстрый выбор периода">
            <CalendarRange className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {DIGEST_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => onChange(p.compute())}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
