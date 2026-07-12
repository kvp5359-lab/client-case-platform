/**
 * Текстовое превью строки «Входящих» (вторая строка ряда): черновик / реакция /
 * событие / текст / медиа. Вынесено из InboxChatItem.tsx (аудит 2026-07-13) —
 * рендер не менялся.
 */
import { cn } from '@/lib/utils'
import { stripHtmlIgnoreQuotes } from '@/utils/format/messengerHtml'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import {
  STATUS_PREFIX,
  SENDER_NAME_CLASS,
  truncateText,
  isAttachmentPlaceholderText,
  getMediaPreview,
  displaySenderName,
} from './inboxChatItem.helpers'

export function InboxItemPreview({
  chat,
  draftText,
  accentText,
  selfSenderName,
  reactionIsNewer,
  eventIsNewer,
}: {
  chat: InboxThreadEntry
  draftText: string | null
  accentText: string
  selfSenderName?: string | null
  reactionIsNewer: boolean
  eventIsNewer: boolean
}) {
  if (draftText) {
    return (
      <>
        <span className="text-red-500 font-medium">Черновик: </span>
        <span className="text-gray-500">{truncateText(draftText, 40)}</span>
      </>
    )
  }

  if (reactionIsNewer && chat.last_reaction_emoji) {
    return (
      <span className="italic text-gray-500">
        {chat.last_reaction_sender_name && (
          <span className={cn('not-italic', SENDER_NAME_CLASS, accentText)}>
            {displaySenderName(chat.last_reaction_sender_name, selfSenderName)}
          </span>
        )}
        {chat.last_reaction_sender_name ? ' отреагировал(а) ' : 'Реакция '}
        <span className="not-italic">{chat.last_reaction_emoji}</span>
        {chat.last_reaction_message_preview && (
          <>
            {' на: '}
            {truncateText(stripHtmlIgnoreQuotes(chat.last_reaction_message_preview), 30)}
          </>
        )}
      </span>
    )
  }

  if (eventIsNewer && chat.last_event_text) {
    // Текст события может начинаться с автора: «Имя · Статус: …».
    // Подсвечиваем имя статуса (после «Статус: »), всё до него — серым.
    const evt = chat.last_event_text
    const idx = evt.indexOf(STATUS_PREFIX)
    if (chat.last_event_status_color && idx >= 0) {
      return (
        <span className="italic">
          <span className="text-gray-500">{evt.slice(0, idx + STATUS_PREFIX.length)}</span>
          <span style={{ color: safeCssColor(chat.last_event_status_color) }}>
            {evt.slice(idx + STATUS_PREFIX.length)}
          </span>
        </span>
      )
    }
    return <span className="text-amber-600 italic">{evt}</span>
  }

  // Текстовое превью: есть осмысленный текст (не плейсхолдер, не пустота).
  const strippedText = chat.last_message_text ? stripHtmlIgnoreQuotes(chat.last_message_text) : ''
  const hasRealText = strippedText.length > 0 && !isAttachmentPlaceholderText(strippedText)
  const hasMediaSignal =
    chat.last_message_attachment_name ||
    chat.last_message_attachment_mime ||
    chat.last_message_attachment_count > 0

  if (hasRealText) {
    return (
      <>
        {chat.last_sender_name && (
          <span className={cn(SENDER_NAME_CLASS, accentText)}>
            {displaySenderName(chat.last_sender_name, selfSenderName)}:{' '}
          </span>
        )}
        {truncateText(strippedText)}
      </>
    )
  }

  if (hasMediaSignal) {
    // Если для media известен mime — «Голосовое / Изображение / Видео», иначе имя файла.
    const media = getMediaPreview(
      chat.last_message_attachment_mime ?? null,
      chat.last_message_attachment_name,
    )
    // ВАЖНО: эмодзи+подпись — ОБЫЧНЫМ инлайн-текстом, без inline-flex (иначе
    // truncate отсекает атомарный блок целиком → «Имя: …», файл не виден).
    return (
      <>
        {chat.last_sender_name && (
          <span className={cn(SENDER_NAME_CLASS, accentText)}>
            {displaySenderName(chat.last_sender_name, selfSenderName)}:{' '}
          </span>
        )}
        <span aria-hidden>{media.emoji}</span>{' '}
        {truncateText(media.label, 36)}
        {chat.last_message_attachment_count > 1 && (
          <span className="text-gray-400">
            {' +'}
            {chat.last_message_attachment_count - 1}
          </span>
        )}
      </>
    )
  }

  return <span className="text-gray-400">Нет сообщений</span>
}
