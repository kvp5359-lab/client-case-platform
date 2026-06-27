'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TIME_OPTIONS } from '@/components/tasks/taskTimeHelpers'
import { cn } from '@/lib/utils'

/**
 * Выбор времени суток тем же 15-минутным гридом, что в поповере срока задачи
 * (TaskTimePickerPopover). Унифицирует вид с дедлайн-пикером. Только время —
 * без даты (дату повтора задаёт расписание).
 */
export function TimeOfDayPopover({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (t: string) => void
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // При открытии проматываем список так, чтобы текущее время (по умолчанию 09:00)
  // было по центру. requestAnimationFrame — дождаться монтирования контента
  // поповера; scrollTop по разнице rect'ов (надёжнее scrollIntoView внутри портала).
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const c = listRef.current
      if (!c) return
      const el = c.querySelector<HTMLButtonElement>(`[data-time="${value}"]`)
      if (!el) return
      const cRect = c.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      c.scrollTop += eRect.top - cRect.top - (c.clientHeight - el.clientHeight) / 2
    })
    return () => cancelAnimationFrame(id)
  }, [open, value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring',
            className,
          )}
        >
          <span>{value}</span>
          <Clock className="h-3.5 w-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1">
        <div
          ref={listRef}
          className="grid max-h-[300px] grid-cols-4 gap-0.5 overflow-y-auto py-1"
        >
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              data-time={t}
              onClick={() => {
                onChange(t)
                setOpen(false)
              }}
              className={cn(
                'rounded px-1 py-1 text-center text-xs transition-colors hover:bg-accent',
                t === value && 'bg-accent font-medium',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
