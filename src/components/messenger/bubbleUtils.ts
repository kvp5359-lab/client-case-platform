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

export function DeliveryIcon({
  status,
  light = false,
}: {
  status: DeliveryStatus
  /** Светлый фон бабла (self/жёлтый) — белая галочка нечитаема, красим тёмным. */
  light?: boolean
}) {
  if (!status) return null
  const c = light ? 'text-amber-900' : 'text-white'
  // Wrapping in <span title="..."> because lucide-react icons don't accept
  // `title` as a prop — only via a surrounding element.
  if (status === 'pending')
    return createElement(
      'span',
      { title: 'Отправляется...' },
      createElement(Clock, {
        className: cn('h-3.5 w-3.5 opacity-60', c),
        strokeWidth: 2.5,
      }),
    )
  if (status === 'read')
    return createElement(
      'span',
      { title: 'Прочитано' },
      createElement(CheckCheck, {
        className: cn('h-3.5 w-3.5', c),
        strokeWidth: 2.5,
      }),
    )
  return createElement(
    'span',
    { title: 'Отправлено' },
    createElement(Check, {
      className: cn('h-3.5 w-3.5 opacity-80', c),
      strokeWidth: 2.5,
    }),
  )
}
