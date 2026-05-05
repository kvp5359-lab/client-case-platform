import { cn } from '@/lib/utils'
import { Check, CheckCheck, AlertCircle, Clock } from 'lucide-react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

export type WazzupDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null

/**
 * Индикатор статуса доставки в Wazzup для исходящих сообщений сотрудника.
 * Источник статусов — webhook от Wazzup пишет в `project_messages.wazzup_status`:
 *   sent → одна галочка
 *   delivered → две галочки
 *   read → две синие галочки (или recipient_read_at заполнено)
 *   error → восклицательный знак
 */
export function useWazzupDeliveryStatus(
  message: ProjectMessage,
  isOwn: boolean,
): WazzupDeliveryStatus {
  // показываем только для исходящих, отправленных через сервис (source='web')
  // и привязанных к Wazzup-треду.
  // ВАЖНО: проверка на не-null, а не на не-undefined — иначе после регенерации
  // TS-типов поля начинают приходить как `null`, и индикатор показывается на ВСЕХ
  // внутренних сообщениях (а должен только на Wazzup'овских).
  const wazzupMsgId = (message as { wazzup_message_id?: string | null }).wazzup_message_id
  const isWazzupBound =
    isOwn &&
    message.source === 'web' &&
    !message.id.startsWith('optimistic-') &&
    (
      (message.wazzup_status !== undefined && message.wazzup_status !== null) ||
      (wazzupMsgId !== undefined && wazzupMsgId !== null)
    )

  if (!isWazzupBound) return null

  const status = message.wazzup_status as string | null | undefined

  if (status === 'error') return 'failed'
  if (status === 'read' || message.recipient_read_at) return 'read'
  if (status === 'delivered') return 'delivered'
  if (status === 'sent') return 'sent'

  // По умолчанию (нет статуса, но это наш Wazzup-тред) — ждём.
  return 'pending'
}

export function WazzupDeliveryIcon({ status }: { status: WazzupDeliveryStatus }) {
  if (!status || status === 'pending') {
    return <Clock className="h-3 w-3 text-white/60" aria-label="Отправка в WhatsApp..." />
  }
  if (status === 'sent') {
    return <Check className="h-3 w-3 text-white/70" aria-label="Отправлено" />
  }
  if (status === 'delivered') {
    return <CheckCheck className="h-3 w-3 text-white/80" aria-label="Доставлено" />
  }
  if (status === 'read') {
    return <CheckCheck className="h-3 w-3 text-blue-300" aria-label="Прочитано" />
  }
  if (status === 'failed') {
    return <AlertCircle className="h-3 w-3 text-red-300" aria-label="Не доставлено" />
  }
  return null
}

export function WazzupFailedBadge() {
  return (
    <div
      className={cn('absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm')}
      title="Не доставлено в WhatsApp"
    >
      <AlertCircle className="h-5 w-5 text-red-500" />
    </div>
  )
}
