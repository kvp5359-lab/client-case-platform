import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

export type TgDeliveryStatus = 'pending' | 'delivered' | 'failed' | null

/** Dot indicator for Telegram delivery status */
export function TelegramDeliveryDot({ status }: { status: 'pending' | 'delivered' }) {
  const color = status === 'delivered' ? 'bg-green-400' : 'bg-white/40 animate-pulse'
  const title = status === 'delivered' ? 'Доставлено в Telegram' : 'Отправка в Telegram...'
  return <span className={cn('inline-block w-1.5 h-1.5 rounded-full', color)} title={title} />
}

/** Failed delivery icon badge */
export function TelegramFailedBadge() {
  return (
    <div
      className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm"
      title="Не доставлено в Telegram"
    >
      <AlertCircle className="h-5 w-5 text-red-500" />
    </div>
  )
}

/** Hook to compute Telegram delivery status */
export function useTelegramDeliveryStatus(
  message: ProjectMessage,
  isOwn: boolean,
  isTelegramLinked?: boolean,
): TgDeliveryStatus {
  const showTgIndicator =
    isOwn && isTelegramLinked && message.source === 'web' && !message.id.startsWith('optimistic-')

  const [tgFailed, setTgFailed] = useState(false)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  const hasAttachments = message.attachments && message.attachments.length > 0

  // Слушаем online/offline: пока офлайн — снимаем «failed» (это могла быть просто
  // временная пропажа сети, а не реальный фейл доставки).
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => {
      setIsOnline(false)
      setTgFailed(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Таймер «не доставилось через N сек» — стартует только если онлайн.
  // Увеличено до 90 сек: пуш в Telegram через триггер + edge function иногда лагает.
  useEffect(() => {
    if (!showTgIndicator) return
    if (!isOnline) return

    const FAILED_AFTER_MS = 90_000

    const startTimer = () => {
      const ageMs = Date.now() - new Date(message.created_at).getTime()
      const remaining = ageMs > FAILED_AFTER_MS ? 0 : FAILED_AFTER_MS - ageMs + 500
      return setTimeout(() => setTgFailed(true), remaining)
    }

    if (!message.telegram_message_id) {
      const timer = startTimer()
      return () => clearTimeout(timer)
    }

    if (hasAttachments && message.telegram_attachments_delivered === null) {
      const timer = startTimer()
      return () => clearTimeout(timer)
    }
  }, [showTgIndicator, isOnline, message.telegram_message_id, message.telegram_attachments_delivered, message.created_at, hasAttachments])

  if (!showTgIndicator) return null

  // Вложения явно не доставлены
  if (hasAttachments && message.telegram_attachments_delivered === false) return 'failed'

  // Текст ещё не доставлен
  if (!message.telegram_message_id) {
    return tgFailed ? 'failed' : 'pending'
  }

  // Текст доставлен, но вложения ещё ожидаются
  if (hasAttachments && message.telegram_attachments_delivered === null) {
    return tgFailed ? 'failed' : 'pending'
  }

  return 'delivered'
}
