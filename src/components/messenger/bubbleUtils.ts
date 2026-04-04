import { Check, CheckCheck, Clock } from 'lucide-react'
import { createElement } from 'react'
import { cn } from '@/lib/utils'
import type { ProjectMessage } from '@/services/api/messengerService'
import type { TgDeliveryStatus } from './TelegramDeliveryIndicator'

export type DeliveryStatus = 'pending' | 'sent' | 'read' | null

export function getDeliveryStatus(
  message: ProjectMessage,
  isOwn: boolean,
  tgStatus: TgDeliveryStatus,
): DeliveryStatus {
  if (!isOwn) return null
  if (tgStatus === 'pending') return 'pending'
  if (tgStatus === 'delivered') return 'sent'
  if (message.source === 'email') {
    if (message.id.startsWith('optimistic-')) return 'pending'
    const meta = message.email_metadata as Record<string, unknown> | null
    if (meta?.read_at) return 'read'
    return 'sent'
  }
  return null
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function DeliveryIcon({ status }: { status: DeliveryStatus }) {
  if (!status) return null
  if (status === 'pending')
    return createElement(Clock, {
      className: 'h-3.5 w-3.5 text-white opacity-60',
      strokeWidth: 2.5,
      title: 'Отправляется...',
    })
  if (status === 'read')
    return createElement(CheckCheck, {
      className: cn('h-3.5 w-3.5 text-white'),
      strokeWidth: 2.5,
      title: 'Прочитано',
    })
  return createElement(Check, {
    className: 'h-3.5 w-3.5 text-white opacity-80',
    strokeWidth: 2.5,
    title: 'Отправлено',
  })
}
