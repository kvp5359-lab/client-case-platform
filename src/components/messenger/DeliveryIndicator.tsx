/**
 * Единый индикатор доставки для всех мессенджер-каналов.
 *
 * Заменяет старые TelegramDeliveryIndicator + WazzupDeliveryIndicator
 * + getDeliveryStatus в bubbleUtils.ts — там на 80% был дублированный код.
 *
 * Возвращает один из четырёх статусов (`pending` / `sent` / `read` / `failed` / null)
 * вне зависимости от канала — UI рисует одинаково: clock/check/double-check/!.
 *
 * Канал-специфичные правила:
 *  - Telegram: ждём `telegram_message_id` + (для вложений) `telegram_attachments_delivered`,
 *    через 90s без id показываем `failed`. `recipient_read_at` (от MTProto) → `read`.
 *  - Wazzup: смотрим на строковое поле `wazzup_status` (sent/delivered/read/error).
 *  - Email: оптимистичное `pending`, наличие read_at в метаданных → `read`.
 */

import { AlertCircle } from 'lucide-react'
import { useTelegramDeliveryStatus } from './TelegramDeliveryIndicator'
import { useWazzupDeliveryStatus } from './WazzupDeliveryIndicator'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { isEmailSource } from '@/services/api/messenger/messengerService.types'

export type DeliveryStatus = 'pending' | 'sent' | 'read' | 'failed' | null

/**
 * Унифицированный хук статуса доставки. В одном месте решает, какой канал
 * у сообщения и какую логику применить.
 */
export function useDeliveryStatus(
  message: ProjectMessage,
  isOwn: boolean,
  opts?: { isTelegramLinked?: boolean; isEmailChat?: boolean },
): DeliveryStatus {
  // Хуки нельзя вызывать условно. Внутри каждого свои early-return для
  // не-своих/не-привязанных сообщений — лишних запросов не делают.
  const tg = useTelegramDeliveryStatus(message, isOwn, opts?.isTelegramLinked)
  const wazzup = useWazzupDeliveryStatus(message, isOwn)

  if (tg === 'failed') return 'failed'
  if (tg === 'pending') return 'pending'
  if (tg === 'read') return 'read'
  if (tg === 'delivered') return 'sent'

  if (wazzup === 'failed') return 'failed'
  if (wazzup === 'pending') return 'pending'
  if (wazzup === 'read') return 'read'
  if (wazzup === 'delivered' || wazzup === 'sent') return 'sent'

  // После email-унификации исходящие пишутся с source='web', а email-флаги
  // (email_send_method / email_delivery_status) проставляет триггер БД +
  // email-internal-send. Поэтому сначала проверяем эти поля — они
  // окончательный признак email-сообщения.
  const ds = (message as unknown as { email_delivery_status?: string | null }).email_delivery_status
  const sm = (message as unknown as { email_send_method?: string | null }).email_send_method
  if (isOwn && (isEmailSource(message.source) || ds || sm || opts?.isEmailChat)) {
    if (message.id.startsWith('optimistic-')) return 'pending'
    // Resend bounce/complaint/failed → красный «не доставлено»
    if (ds === 'bounced' || ds === 'complaint' || ds === 'failed') return 'failed'
    if (ds === 'queued') return 'pending'
    if (ds === 'opened' || ds === 'clicked') return 'read'
    const meta = message.email_metadata as Record<string, unknown> | null
    if (meta?.read_at) return 'read'
    // Email-тред, источник 'web', но email-флаги ещё не выставлены —
    // edge function только что получила message_id и работает над
    // отправкой. Это нормальное «pending» состояние, не «sent».
    if (opts?.isEmailChat && !sm && !ds) return 'pending'
    return 'sent'
  }

  return null
}

/**
 * Единый бейдж «не доставлено» — заменяет TelegramFailedBadge + WazzupFailedBadge.
 */
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
