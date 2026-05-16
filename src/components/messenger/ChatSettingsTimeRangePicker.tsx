/**
 * Time-range picker для задачи (вариант А): начало + конец вместо одного
 * «срока». Чекбокс «весь день» возвращает старое поведение «только дата».
 *
 * Семантика для родителя:
 *   - allDay = true → у задачи только deadline, без слота в календаре
 *     (startAt = NULL, endAt = NULL).
 *   - allDay = false → startAt + endAt задают слот в календаре. Триггер БД
 *     автоматически проставит deadline = endAt.
 */

import { useMemo } from 'react'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Calendar, Clock, X } from 'lucide-react'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Props {
  /** Дата для срока в режиме «весь день» либо для интервала. NULL = срок не задан. */
  date: Date | undefined
  /** false → показываются time-input'ы start/end. true → только дата. */
  allDay: boolean
  /** Начало интервала (используется при allDay=false). HH:mm. */
  startTime: string
  /** Конец интервала (используется при allDay=false). HH:mm. */
  endTime: string
  popoverOpen: boolean
  onPopoverOpenChange: (open: boolean) => void
  onDateChange: (date: Date | undefined) => void
  onAllDayChange: (allDay: boolean) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onClear: () => void
}

export function ChatSettingsTimeRangePicker({
  date,
  allDay,
  startTime,
  endTime,
  popoverOpen,
  onPopoverOpenChange,
  onDateChange,
  onAllDayChange,
  onStartTimeChange,
  onEndTimeChange,
  onClear,
}: Props) {
  const summary = useMemo(() => {
    if (!date) return 'Не указан'
    const d = date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    if (allDay) return d
    return `${d}, ${startTime}–${endTime}`
  }, [date, allDay, startTime, endTime])

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
