"use client"

/**
 * Popover для смены статуса проекта прямо в списке.
 * Триггер — бейдж статуса, контент — список статусов из БД (с учётом
 * наследования от шаблона проекта через `useProjectStatusesForTemplate`).
 */

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useProjectStatusesForTemplate } from '@/hooks/useStatuses'

interface ProjectStatusPopoverProps {
  workspaceId: string
  projectTemplateId: string | null
  currentStatusId: string | null
  onChange: (statusId: string) => void
  disabled?: boolean
}

export function ProjectStatusPopover({
  workspaceId,
  projectTemplateId,
  currentStatusId,
  onChange,
  disabled,
}: ProjectStatusPopoverProps) {
  const [open, setOpen] = useState(false)
  const { data: statuses = [] } = useProjectStatusesForTemplate(workspaceId, projectTemplateId)
  // Без fallback на statuses[0]: когда currentStatusId=null, проект реально
  // не имеет статуса. Дефолтный показывался бы как «есть статус», и список
  // проектов рассинхронизировался с доской («Без статуса 55» vs «Новый» в /projects).
  const current = statuses.find((s) => s.id === currentStatusId) ?? null

  // Если у шаблона нет статусов — выбирать нечего, неинтерактивный span.
  if (statuses.length === 0) {
    return (
      <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border shrink-0 text-muted-foreground/60">
        —
      </span>
    )
  }

  const trigger = current ? (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border shrink-0 transition-opacity hover:opacity-80',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      style={{
        backgroundColor: `${current.color}1A`,
        color: current.color,
        borderColor: `${current.color}66`,
      }}
    >
      {current.name}
    </button>
  ) : (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border border-dashed shrink-0 text-muted-foreground/70 hover:text-foreground hover:border-solid transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      —
    </button>
  )

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="end" onClick={(e) => e.stopPropagation()}>
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onChange(s.id)
              setOpen(false)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
          >
            <span
              className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md border"
              style={{
                backgroundColor: `${s.color}1A`,
                color: s.color,
                borderColor: `${s.color}66`,
              }}
            >
              {s.name}
            </span>
            {s.id === currentStatusId && (
              <Check className="w-3.5 h-3.5 text-primary ml-auto shrink-0" />
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
