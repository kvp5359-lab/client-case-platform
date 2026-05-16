/**
 * ChatSettingsTimeRangePicker — поле «Срок» в карточке настроек задачи.
 * Тонкая обёртка над общим TaskTimePickerPopover с field-триггером.
 *
 * Снаружи продолжает принимать гранулярные поля (date, startTime, endTime,
 * endDate, showDuration) и онченджи к ним — потому что
 * useChatSettingsFormState управляет ими отдельно для save-логики. Внутри
 * собирает в TaskTimeValue для попапа и парсит обратно при изменении.
 */

import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TaskTimePickerPopover,
  type TaskTimeValue,
} from '@/components/tasks/TaskTimePickerPopover'

interface Props {
  date: Date | undefined
  startTime: string
  endTime: string
  endDate: Date | undefined
  showDuration: boolean
  onDateChange: (date: Date | undefined) => void
  onStartTimeChange: (time: string) => void
  onEndTimeChange: (time: string) => void
  onEndDateChange: (date: Date | undefined) => void
  onShowDurationChange: (show: boolean) => void
  onClear: () => void
}

function formatDateShort(d: Date | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function buildIsoFromDateAndTime(date: Date | undefined, time: string): string | null {
  if (!date) return null
  const [hStr, mStr] = time.split(':')
  const h = Number.parseInt(hStr, 10)
  const m = Number.parseInt(mStr, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function formatDateOnly(date: Date | undefined): string | null {
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  /** Собираем гранулярный state в TaskTimeValue для попапа. */
  const value: TaskTimeValue = useMemo(() => {
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
  }, [date, endDate, startTime, endTime, showDuration])

  /** Сводка для кнопки. */
  const summary = useMemo(() => {
    if (!date) return 'Не указан'
    const d1 = formatDateShort(date)
    if (!showDuration) return d1
    const d2 = formatDateShort(endDate ?? date)
    const sameDay = d1 === d2
    const hasTime = Boolean(startTime && endTime)
    if (!hasTime) return sameDay ? d1 : `${d1} — ${d2}`
    if (sameDay) return `${d1}, ${startTime}–${endTime}`
    return `${d1} ${startTime} → ${d2} ${endTime}`
  }, [date, showDuration, startTime, endTime, endDate])

  /** Парсим TaskTimeValue из попапа обратно в гранулярный state. */
  const handleChange = (v: TaskTimeValue) => {
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
      onDateChange(s)
      onEndDateChange(sameDay ? undefined : e)
      onStartTimeChange(
        isMultiDayAllDay
          ? ''
          : `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
      )
      onEndTimeChange(
        isMultiDayAllDay
          ? ''
          : `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`,
      )
      onShowDurationChange(true)
    } else if (v.deadline) {
      onDateChange(new Date(v.deadline))
      onEndDateChange(undefined)
      onStartTimeChange('')
      onEndTimeChange('')
      onShowDurationChange(false)
    } else {
      onClear()
    }
  }

  return (
    <TaskTimePickerPopover
      value={value}
      onChange={handleChange}
      trigger={({ open }) => (
        <button
          type="button"
          onClick={open}
          className={cn(
            'flex items-center gap-1.5 text-sm rounded px-2 py-1 transition-colors shrink-0',
            date
              ? 'text-muted-foreground bg-gray-100 hover:text-foreground hover:bg-gray-200'
              : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-gray-100',
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          {date ? summary : 'Срок'}
        </button>
      )}
    />
  )
}
