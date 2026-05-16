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
import { formatShortDate, formatDateToString } from '@/utils/format/dateFormat'
import { TaskTimePickerPopover, type TaskTimeValue } from './TaskTimePickerPopover'

interface DeadlinePopoverProps {
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
}: DeadlinePopoverProps) {
  const d = deadline ? new Date(deadline) : undefined
  const isOverdue =
    !isFinal &&
    d != null &&
    new Date(d.getFullYear(), d.getMonth(), d.getDate()) <
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

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
            'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors shrink-0',
            isOverdue
              ? 'text-red-600 bg-red-50 font-medium hover:bg-red-100'
              : d
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50',
            isFinal && 'opacity-20 hover:opacity-100',
          )}
          disabled={isPending}
          title="Срок выполнения"
        >
          <Calendar className="w-3 h-3" />
          {d ? formatShortDate(formatDateToString(d)) : 'Срок'}
        </button>
      )}
    />
  )
}
