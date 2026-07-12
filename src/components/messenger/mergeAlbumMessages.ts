/**
 * Склейка альбома в один бабл на фронте.
 *
 * Групповой Telegram-бот присылает альбом (несколько файлов одним сообщением
 * клиента) как N отдельных update → N строк project_messages, по одной на файл
 * (кросс-бот дубли уже схлопнуты content-дедупом на приёме). Инвариант
 * «1 бабл = 1 запись» рушить не хочется, поэтому склеиваем ВИЗУАЛЬНО: соседние
 * строки одного альбома объединяются в одну синтетическую запись с общим
 * массивом attachments — MessageBubble рендерит её как обычно.
 *
 * MTProto склеивает альбом уже в БД (одна запись) → сюда приходит одной строкой,
 * склеивать не с чем (no-op).
 *
 * Ключ склейки — бот-независимые (telegram_sender_user_id, telegram_message_date)
 * + флаг telegram_grouped_id IS NOT NULL («это альбом»). Значение grouped_id НЕ
 * сравниваем: в multi-bot группе разные файлы одного альбома может «выиграть»
 * гонку разный бот, а media_group_id у ботов теоретически различается. sender и
 * date же одинаковы у всех файлов альбома и бот-независимы (на них держится
 * кросс-бот дедуп). Отдельные (не-альбомные) файлы имеют grouped_id=null и не
 * склеиваются даже при совпадении секунды.
 *
 * Чистая функция — тестируется; исходные объекты НЕ мутируются (важно: они лежат
 * в кэше React Query).
 */
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

/** Плейсхолдеры content у медиа без подписи (fallbackContent приёма). */
function isPlaceholderContent(c: string | null | undefined): boolean {
  return !c || c === '📎' || c.startsWith('🟪 Стикер') || c === '🎞 GIF'
}

function isSameAlbum(a: ProjectMessage, b: ProjectMessage): boolean {
  return (
    a.telegram_grouped_id != null &&
    b.telegram_grouped_id != null &&
    a.telegram_sender_user_id != null &&
    a.telegram_message_date != null &&
    String(a.telegram_sender_user_id) === String(b.telegram_sender_user_id) &&
    a.telegram_message_date === b.telegram_message_date
  )
}

/** Худший статус загрузки вложений группы: failed > pending > null. */
function worseAttachmentStatus(
  a: ProjectMessage['attachment_status'],
  b: ProjectMessage['attachment_status'],
): ProjectMessage['attachment_status'] {
  if (a === 'failed' || b === 'failed') return 'failed'
  if (a === 'pending' || b === 'pending') return 'pending'
  return a ?? b ?? null
}

function mergeInto(base: ProjectMessage, add: ProjectMessage): ProjectMessage {
  // caption альбома приходит на одном файле — берём первый осмысленный.
  const content = !isPlaceholderContent(base.content)
    ? base.content
    : !isPlaceholderContent(add.content)
      ? add.content
      : base.content

  const ids = [
    ...new Set([...(base.telegram_message_ids ?? []), ...(add.telegram_message_ids ?? [])]),
  ]

  return {
    ...base,
    content,
    attachments: [...(base.attachments ?? []), ...(add.attachments ?? [])],
    reactions: [...(base.reactions ?? []), ...(add.reactions ?? [])],
    telegram_message_ids: ids,
    attachment_status: worseAttachmentStatus(base.attachment_status, add.attachment_status),
  }
}

export function mergeAlbumMessages(messages: ProjectMessage[]): ProjectMessage[] {
  const out: ProjectMessage[] = []
  for (const msg of messages) {
    const prev = out[out.length - 1]
    if (prev && isSameAlbum(prev, msg)) {
      out[out.length - 1] = mergeInto(prev, msg)
    } else {
      out.push(msg)
    }
  }
  return out
}
