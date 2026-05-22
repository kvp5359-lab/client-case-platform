/**
 * Единый индикатор доставки исходящих сообщений по всем каналам.
 *
 * Источник правды — `project_messages.send_status` ('pending'/'sent'/'failed').
 * Его проставляет backend в одной точке за канал (см. _shared/messageSendStatus.ts).
 *
 * Поверх этого добавляется тонкий слой read-семантики, потому что «прочитано
 * клиентом» — канал-специфичная информация и не везде доступна:
 *   - Telegram MTProto:   `recipient_read_at`     → 'read'
 *   - Wazzup (WhatsApp):  `wazzup_status='read'`  → 'read'
 *   - Email (Resend):     `email_delivery_status ∈ {opened,clicked}` ИЛИ
 *                         `email_metadata.read_at` → 'read'
 *
 * Дополнительно — клиентский таймер на зависший `pending`. Если статус
 * не обновился за CLIENT_TIMEOUT_MS, фронт локально показывает 'failed'.
 * Это страховка на случай, когда pg_net тихо не дёрнул edge function и
 * watchdog `scan_dispatch_failures` ещё не догнал ситуацию.
 */

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

export type DeliveryStatus = 'pending' | 'sent' | 'read' | 'failed' | null

const CLIENT_TIMEOUT_MS = 60_000

/**
 * Унифицированный хук статуса доставки.
 *
 * Возвращает null для:
 *  - входящих (isOwn=false)
 *  - сообщений не из веба (source !== 'web' — это входящие, системные, draft).
 */
export function useDeliveryStatus(message: ProjectMessage, isOwn: boolean): DeliveryStatus {
  // Optimistic-вставка фронта (до INSERT) — всегда pending.
  const isOptimistic = message.id.startsWith('optimistic-')

  // Локальный таймер для зависшего pending — стартует только при необходимости.
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс таймера при изменении входящих условий
    setTimedOut(false)
    if (!isOwn) return
    if (isOptimistic) return
    if (message.send_status !== 'pending') return

    const startedAt = message.send_attempted_at
      ? new Date(message.send_attempted_at).getTime()
      : new Date(message.created_at).getTime()
    const elapsed = Date.now() - startedAt
    const remaining = Math.max(0, CLIENT_TIMEOUT_MS - elapsed) + 500
    const timer = setTimeout(() => setTimedOut(true), remaining)
    return () => clearTimeout(timer)
  }, [isOwn, isOptimistic, message.send_status, message.send_attempted_at, message.created_at])

  if (!isOwn) return null
  if (isOptimistic) return 'pending'

  // send_status — основной сигнал.
  if (message.send_status === 'failed') return 'failed'
  if (message.send_status === 'pending') {
    return timedOut ? 'failed' : 'pending'
  }

  // send_status === 'sent' — может перерасти в 'read' если канал предоставил
  // read-receipt. Иначе остаёмся в 'sent'.
  if (message.recipient_read_at) return 'read'
  if (message.wazzup_status === 'read') return 'read'

  const emailStatus = (message as unknown as { email_delivery_status?: string | null })
    .email_delivery_status
  if (emailStatus === 'opened' || emailStatus === 'clicked') return 'read'

  const emailMeta = message.email_metadata as Record<string, unknown> | null
  if (emailMeta?.read_at) return 'read'

  return 'sent'
}

/** Бейдж «не доставлено» — оверлей в правом верхнем углу баббла. */
export function DeliveryFailedBadge({ title = 'Не доставлено' }: { title?: string }) {
  return (
    <div
      className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm"
      title={title}
    >
      <AlertCircle className="h-5 w-5 text-red-500" />
    </div>
  )
}

/**
 * Сообщение доставлено в Telegram (есть message_id), но триггер при отправке
 * записал диагностику: цитата не нашлась в чате (`reply_dropped:`). По факту
 * клиент сообщение получил, но без цитаты — отправителю полезно знать.
 *
 * Случай `employee_bot_send_failed: ... via=text` — fallback на бота-секретаря —
 * сюда НЕ относится: в некоторых чатах личного бота сотрудника нет by
 * design, отправка через секретаря — штатное поведение, никакой ошибки
 * нет, бейдж только вводил бы пользователя в заблуждение.
 */
export function isSoftTelegramError(message: ProjectMessage): boolean {
  const hasId =
    !!message.telegram_message_id ||
    (Array.isArray(message.telegram_message_ids) && message.telegram_message_ids.length > 0)
  if (!hasId) return false
  const detail = (message as unknown as { telegram_error_detail?: string | null })
    .telegram_error_detail
  if (!detail) return false
  return detail.startsWith('reply_dropped:')
}
