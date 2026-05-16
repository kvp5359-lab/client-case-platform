/**
 * Time-range picker для задачи — паттерн Google Calendar.
 *
 * Четыре поля в ряд: [startDate] [startTime] — [endTime] [endDate].
 * Клик на любое поле → попап под ним: календарь для дат, список 15-мин
 * слотов для времени. Под полями — чекбокс «Весь день» (прячет time-поля).
 *
 * Семантика для родителя:
 *   - allDay = true + endDate == startDate → deadline = date, без слота в календаре
 *   - allDay = true + endDate > startDate  → start_at = startDate 00:00, end_at = endDate 23:59
 *   - allDay = false                       → start_at = startDate + startTime, end_at = endDate + endTime
 */

import { useMemo, useState } from 'react'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Calendar, X } from 'lucide-react'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Props {
  /** Дата начала (всегда задана, если задача имеет срок). */
  date: Date | undefined
  /** false → видны time-поля, true → только даты. */
  allDay: boolean
  /** Начало в HH:mm (используется при !allDay). */
  startTime: string
  /** Конец в HH:mm (используется при !allDay). */
  endTime: string
  /** Если undefined — конец = начало (одна дата). Иначе — другая дата конца. */
  endDate: Date | undefined
  onDateChange: (date: Date | undefined) => void
  onAllDayChange: (allDay: boolean) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onEndDateChange: (date: Date | undefined) => void
  onClear: () => void
}

const TIME_OPTIONS = (() => {
  const out: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

function formatDateShort(d: Date | undefined): string {
  if (!d) return ''
  // 16.05.26 — компактно, помещается в кнопку 90px
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

type ActiveField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null

export function ChatSettingsTimeRangePicker({
  date,
  allDay,
  startTime,
  endTime,
  endDate,
  onDateChange,
  onAllDayChange,
  onStartTimeChange,
  onEndTimeChange,
  onEndDateChange,
  onClear,
}: Props) {
  const [active, setActive] = useState<ActiveField>(null)

  // Эффективная дата конца (== начало, если endDate не задано)
  const effectiveEndDate = endDate ?? date

  const summary = useMemo(() => {
    if (!date) return 'Не указан'
    const d1 = formatDateShort(date)
    if (allDay) {
      const d2 = effectiveEndDate ? formatDateShort(effectiveEndDate) : null
      if (!d2 || d2 === d1) return d1
      return `${d1} → ${d2}`
    }
    const d2 = formatDateShort(effectiveEndDate ?? date)
    if (d1 === d2) return `${d1}, ${startTime}–${endTime}`
    return `${d1} ${startTime} → ${d2} ${endTime}`
  }, [date, allDay, startTime, endTime, effectiveEndDate])

  const closePopover = () => setActive(null)

  const setEndDateMaybe = (d: Date) => {
    // Если новая дата конца совпала со startDate — сбрасываем endDate
    // в undefined (нормальная форма для однодневной задачи)
    if (date && d.toDateString() === date.toDateString()) {
      onEndDateChange(undefined)
    } else {
      onEndDateChange(d)
    }
  }

  const popoverContent = (() => {
    if (active === 'startDate' || active === 'endDate') {
      const selected = active === 'startDate' ? date : effectiveEndDate
      return (
        <CalendarUI
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return
            if (active === 'startDate') {
              onDateChange(d)
              // Если endDate была раньше startDate — сдвинуть
              if (endDate && endDate < d) onEndDateChange(d)
            } else {
              setEndDateMaybe(d)
            }
            closePopover()
          }}
          locale={ru}
        />
      )
    }
    if (active === 'startTime' || active === 'endTime') {
      const current = active === 'startTime' ? startTime : endTime
      return (
        <div className="max-h-[280px] w-[100px] overflow-y-auto py-1">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (active === 'startTime') onStartTimeChange(t)
                else onEndTimeChange(t)
                closePopover()
              }}
              className={cn(
                'block w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors',
                t === current && 'bg-accent font-medium',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )
    }
    return null
  })()

  const fieldBtn = (
    field: ActiveField,
    value: string,
    placeholder: string,
    width: number,
  ) => (
    <button
      type="button"
      onClick={() => setActive(active === field ? null : field)}
      className={cn(
        'h-8 px-2 rounded-md border border-input bg-background text-xs transition-colors hover:bg-accent text-center',
        active === field && 'ring-2 ring-primary/30 border-primary',
        !value && 'text-muted-foreground',
      )}
      style={{ width }}
    >
      {value || placeholder}
    </button>
  )

  return (
    <div className="flex flex-col gap-1 shrink-0" style={{ width: 280 }}>
      <Label className="text-sm text-muted-foreground">Срок</Label>

      <Popover
        open={active !== null}
        onOpenChange={(open) => !open && closePopover()}
        modal
      >
        <PopoverAnchor asChild>
          {!date ? (
            <button
              type="button"
              onClick={() => {
                onDateChange(new Date())
                setActive('startDate')
              }}
              className="flex items-center gap-2 h-9 px-2 rounded-md border border-input bg-background text-sm hover:bg-accent w-full text-gray-400"
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Не указан</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 flex-nowrap">
              {fieldBtn('startDate', formatDateShort(date), '—', 72)}
              {!allDay && fieldBtn('startTime', startTime, '00:00', 50)}
              <span className="text-xs text-muted-foreground px-0.5">—</span>
              {!allDay && fieldBtn('endTime', endTime, '00:00', 50)}
              {fieldBtn('endDate', formatDateShort(effectiveEndDate), '—', 72)}
            </div>
          )}
        </PopoverAnchor>
        <PopoverContent
          className="w-auto p-0 z-[100]"
          align="start"
          sideOffset={4}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {popoverContent}
        </PopoverContent>
      </Popover>

      {/* Сводка под полями */}
      {date && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={summary}>
          {summary}
        </div>
      )}

      {/* Чекбокс «Весь день» + очистить */}
      {date && (
        <div className="flex items-center gap-3 mt-1">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => onAllDayChange(e.target.checked)}
              className="cursor-pointer"
            />
            <span>Весь день</span>
          </label>
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Очистить</span>
          </button>
        </div>
      )}
    </div>
  )
}
