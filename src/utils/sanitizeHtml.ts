/**
 * Санитизация HTML-контента для безопасного рендера через dangerouslySetInnerHTML
 */
import DOMPurify from 'dompurify'

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ADD_ATTR: ['target', 'rel'],
  })
}
