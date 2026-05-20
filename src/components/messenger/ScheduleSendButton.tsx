"use client"

/**
 * Кнопка-пикер «Отправить позже» рядом с кнопкой Send.
 *
 * Popover с пресетами + custom datetime-input. Открывается только
 * когда в редакторе есть контент. Вызывает onSchedule(date) после
 * выбора времени. Валидация минимума +2 минуты — в useScheduleMessage.
 */

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { getSchedulePresets, MIN_SCHEDULE_OFFSET_MS } from '@/hooks/messenger/useScheduleMessage'

interface ScheduleSendButtonProps {
  disabled?: boolean
  onSchedule: (sendAt: Date) => void
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleSendButton({ disabled, onSchedule }: ScheduleSendButtonProps) {
  const [open, setOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const presets = getSchedulePresets()
  const minDate = new Date(Date.now() + MIN_SCHEDULE_OFFSET_MS)

  const handlePick = (d: Date) => {
    if (d.getTime() - Date.now() < MIN_SCHEDULE_OFFSET_MS) {
      setError('Минимум — через 2 минуты')
      return
    }
    setError(null)
    setOpen(false)
    setCustomValue('')
    onSchedule(d)
  }

  const handleCustom = () => {
    if (!customValue) return
    const d = new Date(customValue)
    if (Number.isNaN(d.getTime())) {
      setError('Некорректное время')
      return
    }
    handlePick(d)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          title="Отправить позже"
        >
          <Clock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1">
          Отправить позже
        </div>
        <div className="flex flex-col gap-0.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className="text-left text-sm px-2 py-1.5 rounded hover:bg-accent"
              onClick={() => handlePick(p.getDate())}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="border-t mt-2 pt-2 px-2">
          <label className="text-xs text-muted-foreground block mb-1">
            Своё время
          </label>
          <div className="flex gap-1">
            <Input
              type="datetime-local"
              value={customValue}
              min={toLocalInputValue(minDate)}
              onChange={(e) => {
                setCustomValue(e.target.value)
                setError(null)
              }}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="h-8 px-2"
              disabled={!customValue}
              onClick={handleCustom}
            >
              OK
            </Button>
          </div>
          {error && <div className="text-xs text-destructive mt-1">{error}</div>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
