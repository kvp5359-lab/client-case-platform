/**
 * Чистые хелперы и визуальные константы строки «Входящих» (InboxChatItem).
 * Вынесено из InboxChatItem.tsx (аудит 2026-07-13) — логика не менялась.
 */
import { MessageSquare, Send, Mail, Check, CheckCheck, Clock } from 'lucide-react'
import type { InboxChannelType } from '@/services/api/inboxService'
import type { DeliveryStatus } from './DeliveryIndicator'
import { THREAD_ICONS } from './threadConstants'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

export const STATUS_PREFIX = 'Статус: '

/** Стиль имени отправителя в превью — только вес; цвет берём из акцента треда. */
export const SENDER_NAME_CLASS = 'font-normal'

// formatTime переехал в utils/format/dateFormat.ts (generic-форматтер, второй
// потребитель — «Недавнее» глобального поиска). Реэкспорт для старых импортов.
export { formatTime } from '@/utils/format/dateFormat'

export function truncateText(text: string | null, maxLen = 50): string {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

/**
 * Telegram-бот сохраняет в `content` эмодзи-плейсхолдеры («📎», «🖼», «🎤»…)
 * для сообщений без текста но с вложением. В превью такое имя файла полезнее
 * самой эмодзи: `📎` превращается в `Brief_Bogdanov.docx`.
 */
export function isAttachmentPlaceholderText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return true
  // 1–2 юникод-code-unit'а, не содержащие ни букв, ни цифр, ни типичной пунктуации
  // = эмодзи-плейсхолдер. Нормальные подписи длиннее или содержат буквы.
  if (trimmed.length > 4) return false
  return !/[\p{L}\p{N}]/u.test(trimmed)
}

/**
 * Превью медиа-вложения для inbox-строки. Используется когда у последнего
 * сообщения нет осмысленного текста (пустой / плейсхолдер).
 */
export function getMediaPreview(
  mime: string | null,
  fileName: string | null,
): { emoji: string; label: string } {
  if (mime === 'audio/ogg') return { emoji: '🎤', label: 'Голосовое сообщение' }
  if (mime?.startsWith('audio/')) return { emoji: '🎵', label: 'Аудио' }
  if (mime?.startsWith('image/')) return { emoji: '🖼', label: 'Изображение' }
  if (mime?.startsWith('video/')) return { emoji: '🎬', label: 'Видео' }
  if (fileName) return { emoji: '📎', label: fileName }
  return { emoji: '📎', label: 'Вложение' }
}

/**
 * Имя автора для превью: «Я», если это текущий пользователь; для email-адреса
 * (содержит «@») — локальная часть до «@»; иначе первое слово имени
 * (Telegram-style — без фамилии).
 */
export function displaySenderName(name: string | null, selfSenderName?: string | null): string | null {
  if (!name) return null
  if (selfSenderName && name === selfSenderName) return 'Я'
  const trimmed = name.trim()
  if (trimmed.includes('@')) return trimmed.split('@')[0] || trimmed
  return trimmed.split(/\s+/)[0] || trimmed
}

/** Цвета фона и текста иконки по accent_color чата (из настраиваемой палитры). */
export const accentStyles: Record<string, { bg: string; text: string; badge: string; ring: string }> =
  Object.fromEntries(
    ACCENT_SLUGS.map((s) => [
      s,
      { bg: acc.bgLight(s), text: acc.textMain(s), badge: acc.bgMain(s), ring: acc.ringMain(s) },
    ]),
  )

export const defaultAccent = accentStyles.blue

/**
 * Галочка статуса доставки последнего ИСХОДЯЩЕГО сообщения в превью списка.
 * «отправлено» — одна серая, «прочитано» — две синие. `failed` в превью не рисуем.
 */
export function DeliveryTick({ status }: { status: DeliveryStatus }) {
  if (status === 'pending') return <Clock className="h-3 w-3 shrink-0 text-gray-400" aria-label="Отправляется" />
  if (status === 'read') return <CheckCheck className="h-3 w-3 shrink-0 text-blue-500" aria-label="Прочитано" />
  if (status === 'sent') return <Check className="h-3 w-3 shrink-0 text-gray-400" aria-label="Отправлено" />
  return null
}

/** Иконка типа канала (маленькая, в углу аватара). */
export const channelIcons: Record<InboxChannelType, typeof Send> = {
  telegram: Send,
  email: Mail,
  web: MessageSquare,
}

/** Полная мапа thread_icon → компонент (строится один раз при загрузке модуля).
 *  Для канальных тредов — самолётик/конверт/whatsapp, для задач/чатов — их иконка. */
export const iconByThreadIcon: Record<string, typeof Send> = {
  ...Object.fromEntries(THREAD_ICONS.map((i) => [i.value, i.icon as typeof Send])),
  // MTProto-треды иногда создаются с icon='send' — его нет в реестре THREAD_ICONS.
  send: Send,
}
