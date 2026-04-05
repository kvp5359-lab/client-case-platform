/**
 * Status icon popover for ChatSettingsDialog name field.
 */

import { createElement } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getStatusIcon } from '@/components/ui/status-icons'

interface TaskStatus {
  id: string
  name: string
  color: string
  icon: string | null
  is_default: boolean
}

interface ChatSettingsStatusPopoverProps {
  taskStatuses: TaskStatus[]
  currentStatusId: string | null
  currentStatus: TaskStatus | undefined
  statusPopoverOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (statusId: string) => void
}

export function ChatSettingsStatusPopover({
  taskStatuses,
  currentStatusId,
  currentStatus,
  statusPopoverOpen,
  onOpenChange,
  onSelect,
}: ChatSettingsStatusPopoverProps) {
  if (taskStatuses.length === 0) return null

  return (
    <Popover open={statusPopoverOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center shrink-0 pl-2.5 hover:opacity-70 transition-opacity"
          title={`Статус: ${currentStatus?.name ?? 'Не выбран'}`}
        >
          {createElement(getStatusIcon(currentStatus?.icon), {
            className: 'w-4 h-4',
            style: { color: safeCssColor(currentStatus?.color) || '#9CA3AF' },
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div className="py-1">
          {taskStatuses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors',
                currentStatusId === s.id && 'font-medium',
              )}
            >
              {createElement(getStatusIcon(s.icon), {
                className: 'w-3.5 h-3.5 shrink-0',
                style: { color: safeCssColor(s.color) },
              })}
              {s.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
