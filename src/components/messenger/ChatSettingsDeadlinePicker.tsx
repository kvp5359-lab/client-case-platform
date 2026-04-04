/**
 * Deadline picker popover for ChatSettingsDialog.
 */

import { Calendar as CalendarUI } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Calendar, X } from 'lucide-react'
import { ru } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface ChatSettingsDeadlinePickerProps {
  currentDl: string | null
  currentDlDate: Date | undefined
  isEditMode: boolean
  deadlinePopoverOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (date: Date | undefined) => void
  onClear: () => void
}

export function ChatSettingsDeadlinePicker({
  currentDl,
  currentDlDate,
  deadlinePopoverOpen,
  onOpenChange,
  onSelect,
  onClear,
}: ChatSettingsDeadlinePickerProps) {
  return (
    <div className="flex flex-col gap-1 shrink-0" style={{ width: 140 }}>
      <Label className="text-sm text-muted-foreground">Срок</Label>
      <Popover open={deadlinePopoverOpen} onOpenChange={onOpenChange} modal>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 h-9 px-2 rounded-md border border-input bg-background text-sm transition-colors hover:bg-accent',
              !currentDl && 'text-gray-300',
            )}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {currentDlDate
              ? currentDlDate.toLocaleDateString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : 'Не указан'}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 z-[100]"
          align="start"
          sideOffset={4}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <CalendarUI
            mode="single"
            selected={currentDlDate}
            onSelect={(date) => {
              if (date) {
                onSelect(date)
                onOpenChange(false)
              }
            }}
            locale={ru}
          />
          {currentDl && (
            <div className="border-t px-3 pb-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onClear()
                  onOpenChange(false)
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                Очистить
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
