import { Check, CheckCheck, Clock } from 'lucide-react'
import { createElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * Универсальный статус доставки для DeliveryIcon. 'failed' рендерится
 * отдельным бейджем (DeliveryFailedBadge), сюда не попадает.
 * Логика расчёта вынесена в `useDeliveryStatus` (DeliveryIndicator.tsx).
 */
export type DeliveryStatus = 'pending' | 'sent' | 'read' | null

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function DeliveryIcon({ status }: { status: DeliveryStatus }) {
  if (!status) return null
  // Wrapping in <span title="..."> because lucide-react icons don't accept
  // `title` as a prop — only via a surrounding element.
  if (status === 'pending')
    return createElement(
      'span',
      { title: 'Отправляется...' },
      createElement(Clock, {
        className: 'h-3.5 w-3.5 text-white opacity-60',
        strokeWidth: 2.5,
      }),
    )
  if (status === 'read')
    return createElement(
      'span',
      { title: 'Прочитано' },
      createElement(CheckCheck, {
        className: cn('h-3.5 w-3.5 text-white'),
        strokeWidth: 2.5,
      }),
    )
  return createElement(
    'span',
    { title: 'Отправлено' },
    createElement(Check, {
      className: 'h-3.5 w-3.5 text-white opacity-80',
      strokeWidth: 2.5,
    }),
  )
}
