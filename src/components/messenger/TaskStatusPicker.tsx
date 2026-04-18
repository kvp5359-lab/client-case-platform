"use client"

import { memo, createElement } from 'react'
import { Check, CircleDashed } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getStatusIcon } from '@/components/ui/status-icons'
import type { TaskStatus } from '@/hooks/useStatuses'

interface TaskStatusPickerProps {
  statuses: TaskStatus[]
  currentStatusId: string | null
  pendingStatusId: string | null
  onPick: (statusId: string | null) => void
  disabled?: boolean
}

function StatusDot({ status, muted }: { status: TaskStatus | null; muted?: boolean }) {
  if (!status) {
    return <CircleDashed className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
  }
  const color = muted ? undefined : safeCssColor(status.color)
  if (status.icon) {
    return (
      <span
        className={cn(
          'w-3.5 h-3.5 shrink-0 inline-flex',
          muted && 'text-muted-foreground/40',
        )}
      >
        {createElement(getStatusIcon(status.icon), {
          className: 'w-full h-full',
          style: color ? { color } : undefined,
        })}
      </span>
    )
  }
  return (
    <span
      className={cn('w-2.5 h-2.5 rounded-full shrink-0', muted && 'bg-muted-foreground/25')}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

export const TaskStatusPicker = memo(function TaskStatusPicker({
  statuses,
  currentStatusId,
  pendingStatusId,
  onPick,
  disabled,
}: TaskStatusPickerProps) {
  const currentStatus = statuses.find((s) => s.id === currentStatusId) ?? null
  const pendingStatus = statuses.find((s) => s.id === pendingStatusId) ?? null
  const displayed = pendingStatus ?? currentStatus

  // Подсвечиваем полным цветом, только если выбранный статус отличается от текущего.
  const isChanged =
    pendingStatusId !== null && pendingStatusId !== currentStatusId

  const label = displayed?.name ?? 'Выбрать статус'

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium',
            'transition-colors shrink-0 max-w-[180px] truncate',
            isChanged
              ? 'border-[0.5px] text-foreground'
              : 'border border-dashed border-muted-foreground/20 text-muted-foreground/50 hover:bg-accent/40',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
          style={
            displayed && isChanged
              ? {
                  borderColor: safeCssColor(displayed.color),
                  backgroundColor: `color-mix(in srgb, ${safeCssColor(displayed.color)} 8%, transparent)`,
                }
              : undefined
          }
          title={isChanged ? `Статус будет изменён: ${label}` : label}
        >
          <StatusDot status={displayed} muted={!isChanged} />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="max-h-72 overflow-y-auto">
          {currentStatusId !== null && (
            <button
              type="button"
              onClick={() => onPick(currentStatusId)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm text-muted-foreground',
                'hover:bg-accent',
              )}
            >
              <CircleDashed className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">Не менять</span>
              {!isChanged && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          )}
          {statuses.map((s) => {
            const isPending = pendingStatusId === s.id && isChanged
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm hover:bg-accent"
              >
                <StatusDot status={s} />
                <span className="flex-1 text-left truncate">{s.name}</span>
                {isPending && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            )
          })}
          {statuses.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Статусы не настроены
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
