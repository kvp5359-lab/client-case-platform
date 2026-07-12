import type { ForwardBufferItem, ForwardBufferAttachment } from '@/store/sidePanelStore'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'
import { escapeHtml } from '@/utils/format/messengerHtml'

/** Формат вставки пересылаемого сообщения. */
export type ForwardMode = 'quote' | 'original'

/**
 * Строит HTML для вставки текстового блока пересылки в поле ввода.
 * - `file` — без текста (несёт только вложение).
 * - `original` — оригинальный HTML как есть.
 * - `quote` — blockquote с упоминанием автора + оригинал внутри.
 *
 * blockquote поддержан и санитайзером фронта, и конвертером telegram-send
 * (тот же путь, что у обычного цитирования), поэтому уходит во внешние каналы.
 */
export function buildForwardContent(item: ForwardBufferItem, mode: ForwardMode): string {
  if (item.kind === 'file') return ''
  if (mode === 'original') return item.content
  const author = escapeHtml(item.fromAuthorName || 'сообщение')
  return `<blockquote><p>Переслано от <strong>${author}</strong></p>${item.content}</blockquote>`
}

/**
 * Вложения буфера → формат отправки. Берём те, у кого есть `file_id` ЛИБО
 * `storage_path` — send-функции каналов резолвят файл по `file_id` (через
 * таблицу `files`), а при его отсутствии напрямую по `storage_path` без
 * перезаливки. У MTProto-вложений `file_id` всегда NULL (хранятся только по
 * storage_path) — фильтр строго по `file_id` молча выкидывал их при пересылке.
 */
export function toForwardedAttachments(
  attachments: ForwardBufferAttachment[],
): ForwardedAttachment[] {
  return attachments
    .filter((a) => a.file_id || a.storage_path)
    .map((a) => ({
      file_id: a.file_id ?? null,
      file_name: a.file_name,
      file_size: a.file_size,
      mime_type: a.mime_type,
      storage_path: a.storage_path,
    }))
}
