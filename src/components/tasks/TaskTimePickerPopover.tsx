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
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  TIME_OPTIONS,
  formatDateShort,
  addMinutes,
  isoEqual,
  getInitialScrollTarget,
  parseValue,
  buildValue,
  type ActiveField,
} from './taskTimeHelpers'

export type TaskTimeValue = {
  /** Точечный срок (используется в режиме без длительности). */
  deadline: string | null
  /** ISO начала. Если задан — задача в календаре. */
  startAt: string | null
  /** ISO конца. */
  endAt: string | null
}

type Props = {
  /** Текущее значение. Может прийти из БД. */
  value: TaskTimeValue
  /** Изменение значения. Родитель сохраняет в БД. */
  onChange: (v: TaskTimeValue) => void
  /** Render prop для триггера (chip-кнопка или поле). */
  trigger: (args: { open: () => void; isOpen: boolean }) => ReactNode
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
    <div
      ref={ref}
      className="max-h-[220px] w-full overflow-y-auto py-1 grid grid-cols-4 gap-0.5"
    >
      {options.map((t) => (
        <button
          key={t}
          type="button"
          data-time={t}
          onClick={() => onSelect(t)}
          className={cn(
            'text-center px-1 py-1 text-xs rounded hover:bg-accent transition-colors',
            t === current && 'bg-accent font-medium',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}


export function TaskTimePickerPopover({ value, onChange, trigger }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [active, setActive] = useState<ActiveField>(null)
  const [displayMonth, setDisplayMonth] = useState<Date>(() => new Date())

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
    // Не пред-выбираем сегодня — calendar просто подсветит today как ориентир.
    setActive('startDate')
    setDisplayMonth(date ?? new Date())
    setPopoverOpen(true)
  }

  const closePopover = () => {
    setPopoverOpen(false)
    setActive(null)
    // При закрытии — отправляем изменения наверх, но только если они
    // ЛОГИЧЕСКИ отличаются. Сравнение строк ломалось из-за разных форматов
    // ISO у БД ('+00:00') и new Date().toISOString() ('Z'): открыл попап
    // → просто закрыл → фиксировалась «изменение дедлайна» с одинаковой
    // датой. Сравниваем по эпохе через Date.parse, NaN-флаг = «дата не
    // задана».
    const v = buildValue(date, endDate, startTime, endTime, showDuration)
    if (!isoEqual(v.deadline, value.deadline) ||
        !isoEqual(v.startAt, value.startAt) ||
        !isoEqual(v.endAt, value.endAt)) {
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
        month={displayMonth}
        onMonthChange={setDisplayMonth}
        hideNavigation
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
        className="[--cell-size:2.2rem] p-0 w-full"
        classNames={{
          month_caption: 'hidden',
          months: 'flex flex-col gap-0 w-full',
          month: 'flex w-full flex-col gap-1.5',
          week: 'mt-0.5 flex w-full',
          outside: 'text-muted-foreground/30 aria-selected:text-muted-foreground/30',
        }}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, date, endDate, startTime, endTime, effectiveEndDate, displayMonth])

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
      <PopoverContent
        className="w-[17rem] p-0 z-[100]"
        align="start"
        sideOffset={4}
      >
        <div className="p-2.5 space-y-2">
          {/* Header: prev / month / next + корзина в одной строке */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setDisplayMonth((m) => {
                const d = new Date(m); d.setMonth(d.getMonth() - 1); return d
              })}
              className="p-0.5 rounded text-muted-foreground hover:bg-accent transition-colors"
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium select-none px-1">
              {displayMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setDisplayMonth((m) => {
                const d = new Date(m); d.setMonth(d.getMonth() + 1); return d
              })}
              className="p-0.5 rounded text-muted-foreground hover:bg-accent transition-colors"
              aria-label="Следующий месяц"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Очистить сроки"
              className="ml-auto p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex justify-start">{popoverBody}</div>

          {/* Чекбокс «Указать длительность» — под календарём, выровнен под первой колонкой */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none pl-2 pt-1 pb-1.5">
            <input
              type="checkbox"
              checked={showDuration}
              onChange={(e) => {
                const checked = e.target.checked
                setShowDuration(checked)
                if (!checked) {
                  setStartTime('')
                  setEndTime('')
                  setEndDate(undefined)
                  onChange(buildValue(date, undefined, '', '', false))
                }
                setActive('startDate')
              }}
              className="cursor-pointer"
            />
            <span>Указать длительность</span>
          </label>

          {/* Поля длительности — под чекбоксом */}
          {showDuration && (
            <div className="flex items-center justify-between gap-1 flex-nowrap">
              {fieldBtn('startDate', formatDateShort(date), '—', 68)}
              <div className="flex items-center gap-0">
                {fieldBtn('startTime', startTime, '–:–', 44)}
                <span className="text-xs text-muted-foreground px-0.5">–</span>
                {fieldBtn('endTime', endTime, '–:–', 44)}
              </div>
              {fieldBtn('endDate', endDate ? formatDateShort(endDate) : '', '—', 68)}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
