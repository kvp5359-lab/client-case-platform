import { toast } from 'sonner'
import { stripHtml, isHtmlContent, sanitizeMessengerHtml } from '@/utils/format/messengerHtml'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

/**
 * Копирует текст сообщения в буфер обмена. Для HTML-контента кладёт и
 * text/html (с форматированием — для Word/Notion/Google Docs), и text/plain
 * (для терминалов/textarea). Для plain-текста — только text/plain.
 *
 * Единый источник для пункта меню «Копировать текст» и быстрой иконки копии.
 */
export function copyMessageText(message: ProjectMessage) {
  const raw = message.content
  const plain = stripHtml(raw)
  if (isHtmlContent(raw) && typeof ClipboardItem !== 'undefined') {
    const html = sanitizeMessengerHtml(raw)
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })
    navigator.clipboard
      .write([item])
      .then(() => toast.success('Скопировано'))
      .catch(() => {
        navigator.clipboard.writeText(plain).then(() => toast.success('Скопировано'))
      })
    return
  }
  navigator.clipboard.writeText(plain).then(() => toast.success('Скопировано'))
}
