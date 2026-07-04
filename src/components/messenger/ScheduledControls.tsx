"use client"

/**
 * Контролы под баблом запланированного сообщения:
 * «Отправить сейчас», «Перепланировать» (через тот же пикер времени), «Отменить».
 */

import { Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScheduleSendButton } from './ScheduleSendButton'

type ScheduledControlsProps = {
  messageId: string
  /** Текущее scheduled_send_at — подставится в input «Своё время» при
   *  открытии пикера, чтобы юзер мог быстро его подправить. */
  scheduledSendAt?: string | null
  onSendNow?: (messageId: string) => void
  onCancel?: (messageId: string) => void
  onReschedule?: (messageId: string, sendAt: Date) => void
}

export function ScheduledControls({
  messageId,
  scheduledSendAt,
  onSendNow,
  onCancel,
  onReschedule,
}: ScheduledControlsProps) {
  return (
    <div className="flex justify-end items-center gap-1 mt-1.5">
      {onSendNow && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => onSendNow(messageId)}
          title="Отправить сейчас"
        >
          <Send className="h-3 w-3 mr-1" />
          Сейчас
        </Button>
      )}
      {onReschedule && (
        <ScheduleSendButton
          compact
          initialValue={scheduledSendAt}
          onSchedule={(d) => onReschedule(messageId, d)}
        />
      )}
      {onCancel && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onCancel(messageId)}
          title="Отменить"
          aria-label="Отменить"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

export function formatScheduledTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `сегодня в ${hm}`
  if (isTomorrow) return `завтра в ${hm}`
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
