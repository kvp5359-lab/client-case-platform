/**
 * Popover для выбора статуса задачи.
 * Используется в ThreadTemplateDialog (только для режима task).
 */

import { createElement } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getStatusIcon } from '@/components/ui/status-icons'
import type { Database } from '@/types/database'

type StatusRow = Database['public']['Tables']['statuses']['Row']

interface StatusPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  statuses: StatusRow[]
  statusId: string | null
  onStatusChange: (id: string) => void
}

export function StatusPicker({
  open,
  onOpenChange,
  statuses,
  statusId,
  onStatusChange,
}: StatusPickerProps) {
  const currentStatus = statuses.find((s) => s.id === statusId) ?? null

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 flex-shrink-0">
          {currentStatus ? (
            <>
              {createElement(getStatusIcon(currentStatus.icon), {
                className: 'w-3.5 h-3.5',
                style: { color: currentStatus.color },
              })}
              <span className="text-xs max-w-[80px] truncate">{currentStatus.name}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Статус</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-sm',
              s.id === statusId && 'bg-muted',
            )}
            onClick={() => {
              onStatusChange(s.id)
              onOpenChange(false)
            }}
          >
            {createElement(getStatusIcon(s.icon), {
              className: 'w-4 h-4 flex-shrink-0',
              style: { color: s.color },
            })}
            <span className="truncate">{s.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
