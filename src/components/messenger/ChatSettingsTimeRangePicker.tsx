/**
 * Time-range picker для задачи (вариант А): начало + конец вместо одного
 * «срока». Чекбокс «весь день» возвращает старое поведение «только дата».
 *
 * Семантика для родителя:
 *   - allDay = true → у задачи только deadline, без слота в календаре
 *     (startAt = NULL, endAt = NULL).
 *   - allDay = false → startAt + endAt задают слот в календаре. Триггер БД
 *     автоматически проставит deadline = endAt.
 *   - endDate (опционально, только при allDay = false) — дата конца, если
 *     отличается от даты начала. Многодневная задача.
 */

import { useMemo, useState } from 'react'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Calendar, Clock, X } from 'lucide-react'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Props {
  /** Дата начала (или дата срока в режиме «весь день»). NULL = срок не задан. */
  date: Date | undefined
  /** false → time-input'ы start/end. true → только дата. */
  allDay: boolean
  /** Начало интервала. HH:mm. */
  startTime: string
  /** Конец интервала. HH:mm. */
  endTime: string
  /** Если задано — конец на другой дате (многодневная задача). */
  endDate: Date | undefined
  popoverOpen: boolean
  onPopoverOpenChange: (open: boolean) => void
  onDateChange: (date: Date | undefined) => void
  onAllDayChange: (allDay: boolean) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onEndDateChange: (date: Date | undefined) => void
  onClear: () => void
}

export function ChatSettingsTimeRangePicker({
  date,
  allDay,
  startTime,
  endTime,
  endDate,
  popoverOpen,
  onPopoverOpenChange,
  onDateChange,
  onAllDayChange,
  onStartTimeChange,
  onEndTimeChange,
  onEndDateChange,
  onClear,
}: Props) {
  const [endCalendarOpen, setEndCalendarOpen] = useState(false)

  const summary = useMemo(() => {
    if (!date) return 'Не указан'
    const fmt = (d: Date) =>
      d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    const d1 = fmt(date)
    if (allDay) return fmt(date).replace(/\.(\d{2})$/, '.$1')
    if (endDate) {
      const d2 = fmt(endDate)
      return `${d1} ${startTime} → ${d2} ${endTime}`
    }
    return `${d1}, ${startTime}–${endTime}`
  }, [date, allDay, startTime, endTime, endDate])

  return (
    <div className="flex flex-col gap-1 shrink-0" style={{ width: 220 }}>
      <Label className="text-sm text-muted-foreground">Срок</Label>
      <Popover open={popoverOpen} onOpenChange={onPopoverOpenChange} modal>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 h-9 px-2 rounded-md border border-input bg-background text-sm transition-colors hover:bg-accent text-left',
              !date && 'text-gray-300',
            )}
          >
            {allDay || !date ? (
              <Calendar className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Clock className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">{summary}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 z-[100]"
          align="start"
          sideOffset={4}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <CalendarUI
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) onDateChange(d)
            }}
            locale={ru}
          />
          <div className="border-t px-3 py-2 space-y-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => onAllDayChange(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Весь день</span>
            </label>
            {!allDay && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={startTime}
                    step={1800}
                    onChange={(e) => onStartTimeChange(e.target.value)}
                    className="border border-input rounded px-2 py-1 text-xs"
                    aria-label="Начало"
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <input
                    type="time"
                    value={endTime}
                    step={1800}
                    onChange={(e) => onEndTimeChange(e.target.value)}
                    className="border border-input rounded px-2 py-1 text-xs"
                    aria-label="Конец"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={endDate !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // По умолчанию — следующий день после начала
                        const next = date ? new Date(date) : new Date()
                        next.setDate(next.getDate() + 1)
                        onEndDateChange(next)
                      } else {
                        onEndDateChange(undefined)
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <span>Заканчивается в другой день</span>
                </label>
                {endDate !== undefined && (
                  <Popover open={endCalendarOpen} onOpenChange={setEndCalendarOpen} modal>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 h-7 px-2 rounded border border-input bg-background text-xs hover:bg-accent w-full text-left"
                      >
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>
                          Конец:{' '}
                          {endDate.toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 z-[110]"
                      align="start"
                      sideOffset={4}
                      onPointerDownOutside={(e) => e.preventDefault()}
                      onInteractOutside={(e) => e.preventDefault()}
                    >
                      <CalendarUI
                        mode="single"
                        selected={endDate}
                        onSelect={(d) => {
                          if (d) {
                            onEndDateChange(d)
                            setEndCalendarOpen(false)
                          }
                        }}
                        locale={ru}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </>
            )}
            {date && (
              <button
                type="button"
                onClick={() => {
                  onClear()
                  onPopoverOpenChange(false)
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                Очистить
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
