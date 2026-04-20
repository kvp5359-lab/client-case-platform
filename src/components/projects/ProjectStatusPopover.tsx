"use client"

/**
 * Popover для смены статуса проекта прямо в списке.
 * Триггер — бейдж статуса, контент — список PROJECT_STATUSES.
 */

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { PROJECT_STATUSES } from '@/page-components/ProjectPage/constants'

interface ProjectStatusPopoverProps {
  currentStatus: string | null
  onChange: (status: string) => void
  disabled?: boolean
}

export function ProjectStatusPopover({
  currentStatus,
  onChange,
  disabled,
}: ProjectStatusPopoverProps) {
  const [open, setOpen] = useState(false)
  const status = PROJECT_STATUSES.find((s) => s.value === currentStatus) || PROJECT_STATUSES[0]

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border shrink-0 transition-opacity hover:opacity-80',
            status.color,
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {status.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end" onClick={(e) => e.stopPropagation()}>
        {PROJECT_STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => {
              onChange(s.value)
              setOpen(false)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
          >
            <span
              className={cn(
                'inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border',
                s.color,
              )}
            >
              {s.label}
            </span>
            {s.value === currentStatus && (
              <Check className="w-3.5 h-3.5 text-primary ml-auto shrink-0" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
