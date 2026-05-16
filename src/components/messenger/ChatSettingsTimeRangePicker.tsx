/**
 * Time-range picker для задачи — паттерн Google Calendar, упрощённый.
 *
 * В карточке — одна кнопка-сводка. По клику открывается попап:
 *   - сверху ряд: [startDate] [startTime] — [endTime] [endDate]
 *   - календарь — клик меняет активное поле даты (start или end)
 *   - кнопка «Очистить» снизу
 *
 * Семантика:
 *   - startTime и endTime пустые → задача «весь день» (без слота в календаре)
 *   - оба заполнены → задача со слотом в календаре
 *   - endDate undefined → конец = startDate (одна дата)
 *   - endDate задано и > startDate → диапазон
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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
  date: Date | undefined
  /** Время начала HH:mm или пустая строка = «весь день» */
  startTime: string
  /** Время конца HH:mm или пустая строка */
  endTime: string
  /** undefined = тот же день, что и date */
  endDate: Date | undefined
  /** false → одна дата; true → 4 поля (дата+время начала и конца) */
  showDuration: boolean
  onDateChange: (date: Date | undefined) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onEndDateChange: (date: Date | undefined) => void
  onShowDurationChange: (show: boolean) => void
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
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function parseHM(time: string): { h: number; m: number } | null {
  if (!time) return null
  const [hStr, mStr] = time.split(':')
  const h = Number.parseInt(hStr, 10)
  const m = Number.parseInt(mStr, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return { h, m }
}

function addMinutes(time: string, addMin: number): string {
  const t = parseHM(time)
  if (!t) return ''
  const total = t.h * 60 + t.m + addMin
  const norm = ((total % 1440) + 1440) % 1440
  const h = Math.floor(norm / 60)
  const m = norm % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type ActiveField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null

/**
 * Куда автоскроллить список времени при открытии.
 * - Если есть выбранное значение — на него
 * - Для endTime — startTime + 30 мин
 * - Иначе — текущее время округлённое вниз до 15 мин, не раньше 09:00
 */
function getInitialScrollTarget(
  field: 'startTime' | 'endTime',
  current: string,
  startTime: string,
): string {
  if (current) return current
  if (field === 'endTime' && startTime) {
    return addMinutes(startTime, 30)
  }
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const rounded = `${String(h).padStart(2, '0')}:${String(Math.floor(m / 15) * 15).padStart(2, '0')}`
  return rounded < '09:00' ? '09:00' : rounded
}

interface TimeListProps {
  options: string[]
  current: string
  highlight: string
  onSelect: (t: string) => void
}

function TimeList({ options, current, highlight, onSelect }: TimeListProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(
      `[data-time="${highlight}"]`,
    )
    if (el) {
      el.scrollIntoView({ block: 'center' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={ref} className="max-h-[260px] w-[90px] overflow-y-auto py-1">
      {options.map((t) => (
        <button
          key={t}
          type="button"
          data-time={t}
          onClick={() => onSelect(t)}
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

export function ChatSettingsTimeRangePicker({
  date,
  startTime,
  endTime,
  endDate,
  showDuration,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onEndDateChange,
  onShowDurationChange,
  onClear,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [active, setActive] = useState<ActiveField>(null)

  const effectiveEndDate = endDate ?? date
  const hasTime = Boolean(startTime || endTime)

  /** Сводка для кнопки в карточке. */
  const summary = useMemo(() => {
    if (!date) return 'Не указан'
    const d1 = formatDateShort(date)
    if (!showDuration) return d1
    const d2 = formatDateShort(effectiveEndDate ?? date)
    const sameDay = d1 === d2
    if (!hasTime) {
      return sameDay ? d1 : `${d1} — ${d2}`
    }
    if (sameDay) return `${d1}, ${startTime}–${endTime}`
    return `${d1} ${startTime} → ${d2} ${endTime}`
  }, [date, showDuration, hasTime, startTime, endTime, effectiveEndDate])

  const openPopover = () => {
    if (!date) onDateChange(new Date())
    // Активным сразу становится startDate — чтобы юзеру было ясно, что
    // календарь меняет именно эту дату.
    setActive('startDate')
    setPopoverOpen(true)
  }

  const closePopover = () => {
    setPopoverOpen(false)
    setActive(null)
  }

  const handleStartTimeChange = (t: string) => {
    onStartTimeChange(t)
    // Авто-дополнение: если end_time пустое — выставляем start + 30 мин
    if (!endTime) onEndTimeChange(addMinutes(t, 30))
  }
  const handleEndTimeChange = (t: string) => {
    onEndTimeChange(t)
    if (!startTime) onStartTimeChange(addMinutes(t, -30))
  }

  const setEndDateMaybe = (d: Date) => {
    if (date && d.toDateString() === date.toDateString()) {
      onEndDateChange(undefined)
    } else {
      onEndDateChange(d)
    }
  }

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

  // Содержимое для активного time-поля или (если активна дата / ничего) — календарь
  const popoverBody = (() => {
    if (active === 'startTime' || active === 'endTime') {
      const current = active === 'startTime' ? startTime : endTime
      const sameDayAsStart = !endDate
      const options =
        active === 'endTime' && startTime && sameDayAsStart
          ? TIME_OPTIONS.filter((t) => t > startTime)
          : TIME_OPTIONS
      return (
        <TimeList
          options={options}
          current={current}
          highlight={getInitialScrollTarget(active, current, startTime)}
          onSelect={(t) => {
            if (active === 'startTime') handleStartTimeChange(t)
            else handleEndTimeChange(t)
            setActive(null)
          }}
        />
      )
    }
    // По умолчанию (нет активного поля или активно поле даты) — календарь
    const activeDateField: 'startDate' | 'endDate' =
      active === 'endDate' ? 'endDate' : 'startDate'
    const selected = activeDateField === 'startDate' ? date : effectiveEndDate
    return (
      <CalendarUI
        mode="single"
        selected={selected}
        onSelect={(d) => {
          if (!d) return
          if (activeDateField === 'startDate') {
            onDateChange(d)
            // Если endDate была раньше — сдвинуть к новой start
            if (endDate && endDate < d) onEndDateChange(d)
          } else {
            setEndDateMaybe(d)
          }
        }}
        locale={ru}
      />
    )
  })()

  return (
    <div className="flex flex-col gap-1 shrink-0" style={{ width: 200 }}>
      <Label className="text-sm text-muted-foreground">Срок</Label>

      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          if (!open) closePopover()
          else setPopoverOpen(true)
        }}
        modal
      >
        <PopoverAnchor asChild>
          <button
            type="button"
            onClick={openPopover}
            className={cn(
              'flex items-center gap-2 h-9 px-2 rounded-md border border-input bg-background text-sm transition-colors hover:bg-accent text-left w-full',
              !date && 'text-gray-400',
            )}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{summary}</span>
          </button>
        </PopoverAnchor>
        <PopoverContent
          className="w-auto p-0 z-[100]"
          align="start"
          sideOffset={4}
        >
          <div className="p-3 space-y-2.5">
            {/* Чекбокс «Указать длительность» сверху */}
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDuration}
                onChange={(e) => {
                  onShowDurationChange(e.target.checked)
                  if (!e.target.checked) {
                    onStartTimeChange('')
                    onEndTimeChange('')
                    onEndDateChange(undefined)
                  }
                  setActive('startDate')
                }}
                className="cursor-pointer"
              />
              <span>Указать длительность</span>
            </label>

            {/* Ряд полей под чекбоксом — только в режиме длительности */}
            {showDuration && (
              <div className="flex items-center gap-1 flex-nowrap">
                {fieldBtn('startDate', formatDateShort(date), '—', 72)}
                {fieldBtn('startTime', startTime, '--:--', 52)}
                <span className="text-xs text-muted-foreground px-0.5">—</span>
                {fieldBtn('endTime', endTime, '--:--', 52)}
                {/* endDate показываем только если отличается от startDate */}
                {fieldBtn('endDate', endDate ? formatDateShort(endDate) : '', '—', 72)}
              </div>
            )}

            {/* Тело попапа: календарь или time-list */}
            <div className="flex justify-center">{popoverBody}</div>

            {/* Очистить */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onClear()
                  closePopover()
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                <span>Очистить</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
