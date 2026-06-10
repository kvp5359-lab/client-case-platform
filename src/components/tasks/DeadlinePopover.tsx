"use client"

/**
 * DeadlinePopover — компактный chip-триггер для срока задачи.
 *
 * Сам попап (с длительностью, временем, диапазоном дат) общий —
 * TaskTimePickerPopover. Здесь только chip-стилизация и подсветка
 * просрочки.
 *
 * API: поддерживает два варианта (backward-compat):
 *   - НОВЫЙ: onChange({ deadline, startAt, endAt }) — все три поля.
 *   - СТАРЫЙ: onSet(date) + onClear() — только deadline. Конвертируется
 *     внутрь onChange (start_at/end_at теряются — в местах где старый
 *     API, расширенный режим попапа всё равно работает в UI, но при
 *     сохранении уйдёт только deadline).
 */

import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getDeadlineAccentClass,
  formatDeadlineDisplay,
  type DeadlineNearFormat,
  type DeadlineFarFormat,
} from '@/utils/deadlineUtils'
import { useDeadlineFormat } from '@/hooks/useDeadlineFormat'
import { TaskTimePickerPopover, type TaskTimeValue } from './TaskTimePickerPopover'

function formatHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Сводка для chip: учитывает start_at/end_at если они есть.
 *   - "17 мая" — только deadline
 *   - "17 мая — 19 мая" — многодневная all-day (start 00:00 / end 23:59)
 *   - "17 мая 09:00" — с временем (одна дата)
 *   - "17 мая 22:00 → 18 мая 06:00" — встреча через ночь
 */
function buildChipSummary(
  deadline: string,
  startAt: string | null,
  endAt: string | null,
  fmt: { near: DeadlineNearFormat; far: DeadlineFarFormat },
): string {
  const d = (date: Date) => formatDeadlineDisplay(date, fmt) ?? ''
  if (startAt && endAt) {
    const s = new Date(startAt)
    const e = new Date(endAt)
    const sameDay =
      s.getFullYear() === e.getFullYear() &&
      s.getMonth() === e.getMonth() &&
      s.getDate() === e.getDate()
    const isMultiDayAllDay =
      !sameDay &&
      s.getHours() === 0 && s.getMinutes() === 0 &&
      e.getHours() === 23 && e.getMinutes() === 59
    if (isMultiDayAllDay) {
      return `${d(s)} — ${d(e)}`
    }
    if (sameDay) {
      return `${d(s)} ${formatHM(s)}–${formatHM(e)}`
    }
    return `${d(s)} ${formatHM(s)} → ${d(e)} ${formatHM(e)}`
  }
  return d(new Date(deadline))
}

type DeadlinePopoverProps = {
  deadline: string | null
  /** Запланированное начало — для отображения в попапе. */
  startAt?: string | null
  /** Запланированный конец. */
  endAt?: string | null
  /** Новый API. Если передан — приоритет. */
  onChange?: (v: TaskTimeValue) => void
  /** Старый API. Используется если onChange не передан. */
  onSet?: (date: Date) => void
  /** Старый API. Используется если onChange не передан. */
  onClear?: () => void
  isPending: boolean
  /** Задача завершена/отменена — не подсвечивать просрочку */
  isFinal?: boolean
  /** Доп. классы на chip-триггер (напр. hover-only видимость для пустого срока). */
  triggerClassName?: string
}

export function DeadlinePopover({
  deadline,
  startAt,
  endAt,
  onChange,
  onSet,
  onClear,
  isPending,
  isFinal,
  triggerClassName,
}: DeadlinePopoverProps) {
  const deadlineFormat = useDeadlineFormat()

  const handleChange = (v: TaskTimeValue) => {
    if (onChange) {
      onChange(v)
      return
    }
    // Fallback на старый API: пробрасываем только deadline.
    if (v.deadline === null) {
      onClear?.()
    } else {
      onSet?.(new Date(v.deadline))
    }
  }

  return (
    <TaskTimePickerPopover
      value={{ deadline, startAt: startAt ?? null, endAt: endAt ?? null }}
      onChange={handleChange}
      trigger={({ open }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          className={cn(
            'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors shrink-0 whitespace-nowrap',
            getDeadlineAccentClass(deadline, { variant: 'chip', isFinal }),
            isFinal && 'opacity-20 hover:opacity-100',
            triggerClassName,
          )}
          disabled={isPending}
          title="Срок выполнения"
        >
          <Calendar className="w-3 h-3" />
          {deadline
            ? buildChipSummary(deadline, startAt ?? null, endAt ?? null, deadlineFormat)
            : 'Срок'}
        </button>
      )}
    />
  )
}
