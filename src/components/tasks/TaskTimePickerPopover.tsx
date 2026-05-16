"use client"

/**
 * Общий попап выбора срока + времени + длительности для задач.
 *
 * Используется в:
 *   - DeadlinePopover (chip-триггер в строках, шапке боковой панели)
 *   - ChatSettingsTimeRangePicker (field-триггер в карточке настроек задачи)
 *
 * Триггер задаётся через render prop. Логика и UI попапа едины.
 *
 * Семантика onChange (см. документацию ChatSettingsTimeRangePicker):
 *   - showDuration=false → только deadline (без слота)
 *   - showDuration=true + времена пустые + одна дата → только deadline
 *   - showDuration=true + времена пустые + диапазон дат → start_at=00:00,
 *     end_at=endDate 23:59 (многодневная all-day)
 *   - showDuration=true + времена → start_at=start+time, end_at=(end??start)+time
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import { X } from 'lucide-react'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export interface TaskTimeValue {
  /** Точечный срок (используется в режиме без длительности). */
  deadline: string | null
  /** ISO начала. Если задан — задача в календаре. */
  startAt: string | null
  /** ISO конца. */
  endAt: string | null
}

interface Props {
  /** Текущее значение. Может прийти из БД. */
  value: TaskTimeValue
  /** Изменение значения. Родитель сохраняет в БД. */
  onChange: (v: TaskTimeValue) => void
  /** Render prop для триггера (chip-кнопка или поле). */
  trigger: (args: { open: () => void; isOpen: boolean }) => ReactNode
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

function buildIsoFromDateAndTime(date: Date | undefined, time: string): string | null {
  if (!date) return null
  const t = parseHM(time)
  if (!t) return null
  const d = new Date(date)
  d.setHours(t.h, t.m, 0, 0)
  return d.toISOString()
}

function formatDateOnly(date: Date | undefined): string | null {
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type ActiveField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null

function getInitialScrollTarget(
  field: 'startTime' | 'endTime',
  current: string,
  startTime: string,
): string {
  if (current) return current
  if (field === 'endTime' && startTime) return addMinutes(startTime, 30)
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const rounded = `${String(h).padStart(2, '0')}:${String(Math.floor(m / 15) * 15).padStart(2, '0')}`
  return rounded < '09:00' ? '09:00' : rounded
}

function TimeList({
  options,
  current,
  highlight,
  onSelect,
}: {
  options: string[]
  current: string
  highlight: string
  onSelect: (t: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-time="${highlight}"]`)
    if (el) el.scrollIntoView({ block: 'center' })
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

/**
 * Парсит value (deadline/startAt/endAt из БД) в локальный state формы.
 */
function parseValue(v: TaskTimeValue): {
  date: Date | undefined
  endDate: Date | undefined
  startTime: string
  endTime: string
  showDuration: boolean
} {
  if (v.startAt && v.endAt) {
    const s = new Date(v.startAt)
    const e = new Date(v.endAt)
    const sameDay =
      s.getFullYear() === e.getFullYear() &&
      s.getMonth() === e.getMonth() &&
      s.getDate() === e.getDate()
    const isMultiDayAllDay =
      !sameDay &&
      s.getHours() === 0 && s.getMinutes() === 0 &&
      e.getHours() === 23 && e.getMinutes() === 59
    return {
      date: s,
      endDate: sameDay ? undefined : e,
      startTime: isMultiDayAllDay
        ? ''
        : `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
      endTime: isMultiDayAllDay
        ? ''
        : `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`,
      showDuration: true,
    }
  }
  return {
    date: v.deadline ? new Date(v.deadline) : undefined,
    endDate: undefined,
    startTime: '',
    endTime: '',
    showDuration: false,
  }
}

/**
 * Собирает state в TaskTimeValue для родителя.
 */
function buildValue(
  date: Date | undefined,
  endDate: Date | undefined,
  startTime: string,
  endTime: string,
  showDuration: boolean,
): TaskTimeValue {
  if (!date) return { deadline: null, startAt: null, endAt: null }
  if (!showDuration) {
    return { deadline: formatDateOnly(date), startAt: null, endAt: null }
  }
  const hasTime = Boolean(startTime && endTime)
  if (!hasTime) {
    if (endDate) {
      const startAt = buildIsoFromDateAndTime(date, '00:00')
      const endAt = buildIsoFromDateAndTime(endDate, '23:59')
      return { deadline: endAt, startAt, endAt }
    }
    return { deadline: formatDateOnly(date), startAt: null, endAt: null }
  }
  const startAt = buildIsoFromDateAndTime(date, startTime)
  const endAt = buildIsoFromDateAndTime(endDate ?? date, endTime)
  return { deadline: endAt, startAt, endAt }
}

export function TaskTimePickerPopover({ value, onChange, trigger }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [active, setActive] = useState<ActiveField>(null)

  // Локальный state формы — инициализируется из value при открытии и при
  // каждом изменении value снаружи.
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [showDuration, setShowDuration] = useState(false)

  // Синхронизация локального state с value (когда меняется снаружи)
  const valueKey = `${value.deadline}|${value.startAt}|${value.endAt}`
  const [prevKey, setPrevKey] = useState('')
  if (valueKey !== prevKey) {
    setPrevKey(valueKey)
    const parsed = parseValue(value)
    setDate(parsed.date)
    setEndDate(parsed.endDate)
    setStartTime(parsed.startTime)
    setEndTime(parsed.endTime)
    setShowDuration(parsed.showDuration)
  }

  const effectiveEndDate = endDate ?? date

  const open = () => {
    if (!date) setDate(new Date())
    setActive('startDate')
    setPopoverOpen(true)
  }

  const closePopover = () => {
    setPopoverOpen(false)
    setActive(null)
    // При закрытии — отправляем изменения наверх
    const v = buildValue(date, endDate, startTime, endTime, showDuration)
    if (
      v.deadline !== value.deadline ||
      v.startAt !== value.startAt ||
      v.endAt !== value.endAt
    ) {
      onChange(v)
    }
  }

  const handleClear = () => {
    setDate(undefined)
    setEndDate(undefined)
    setStartTime('')
    setEndTime('')
    setShowDuration(false)
    setPopoverOpen(false)
    setActive(null)
    onChange({ deadline: null, startAt: null, endAt: null })
  }

  const handleStartTimeChange = (t: string) => {
    setStartTime(t)
    if (!endTime) setEndTime(addMinutes(t, 30))
  }
  const handleEndTimeChange = (t: string) => {
    setEndTime(t)
    if (!startTime) setStartTime(addMinutes(t, -30))
  }

  const setEndDateMaybe = (d: Date) => {
    if (date && d.toDateString() === date.toDateString()) {
      setEndDate(undefined)
    } else {
      setEndDate(d)
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

  const popoverBody = useMemo(() => {
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
            setDate(d)
            if (endDate && endDate < d) setEndDate(d)
          } else {
            setEndDateMaybe(d)
          }
        }}
        locale={ru}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, date, endDate, startTime, endTime, effectiveEndDate])

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(o) => {
        if (!o) closePopover()
        else setPopoverOpen(true)
      }}
      modal
    >
      <PopoverAnchor asChild>
        <span>{trigger({ open, isOpen: popoverOpen })}</span>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-0 z-[100]" align="start" sideOffset={4}>
        <div className="p-3 space-y-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDuration}
              onChange={(e) => {
                setShowDuration(e.target.checked)
                if (!e.target.checked) {
                  setStartTime('')
                  setEndTime('')
                  setEndDate(undefined)
                }
                setActive('startDate')
              }}
              className="cursor-pointer"
            />
            <span>Указать длительность</span>
          </label>

          {showDuration && (
            <div className="flex items-center gap-1 flex-nowrap">
              {fieldBtn('startDate', formatDateShort(date), '—', 72)}
              {fieldBtn('startTime', startTime, '--:--', 52)}
              <span className="text-xs text-muted-foreground px-0.5">—</span>
              {fieldBtn('endTime', endTime, '--:--', 52)}
              {fieldBtn('endDate', endDate ? formatDateShort(endDate) : '', '—', 72)}
            </div>
          )}

          <div className="flex justify-center">{popoverBody}</div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Очистить</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
