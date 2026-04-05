"use client"

/**
 * DeadlinePopover — попап выбора срока задачи (переиспользуемый).
 */

import { useState } from 'react'
import { Calendar, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { formatShortDate, formatDateToString } from '@/utils/dateFormat'

interface DeadlinePopoverProps {
  deadline: string | null
  onSet: (date: Date) => void
  onClear: () => void
  isPending: boolean
}

export function DeadlinePopover({ deadline, onSet, onClear, isPending }: DeadlinePopoverProps) {
  const [open, setOpen] = useState(false)
  const d = deadline ? new Date(deadline) : undefined
  const isOverdue =
    d != null &&
    new Date(d.getFullYear(), d.getMonth(), d.getDate()) <
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors shrink-0',
            isOverdue
              ? 'text-red-600 bg-red-50 font-medium hover:bg-red-100'
              : d
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50',
          )}
          disabled={isPending}
          title="Срок выполнения"
        >
          <Calendar className="w-3 h-3" />
          {d ? formatShortDate(formatDateToString(d)) : 'Срок'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <CalendarUI
          mode="single"
          selected={d}
          onSelect={(date) => {
            if (date) {
              onSet(date)
              setOpen(false)
            }
          }}
          locale={ru}
        />
        {d && (
          <div className="border-t px-3 pb-3 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onClear()
                setOpen(false)
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
              Очистить срок
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
