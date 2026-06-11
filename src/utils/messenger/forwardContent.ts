import type { ForwardBufferItem, ForwardBufferAttachment } from '@/store/sidePanelStore'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'

/** Формат вставки пересылаемого сообщения. */
export type ForwardMode = 'quote' | 'original'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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
 * Вложения буфера → формат отправки. Только те, у кого есть `file_id`
 * (send-функции каналов резолвят файл по нему / storage_path без перезаливки).
 */
export function toForwardedAttachments(
  attachments: ForwardBufferAttachment[],
): ForwardedAttachment[] {
  return attachments
    .filter((a) => a.file_id)
    .map((a) => ({
      file_id: a.file_id!,
      file_name: a.file_name,
      file_size: a.file_size,
      mime_type: a.mime_type,
      storage_path: a.storage_path,
    }))
}
