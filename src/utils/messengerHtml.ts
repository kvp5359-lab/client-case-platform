/**
 * Утилиты для работы с HTML-контентом мессенджера
 */
import DOMPurify from 'dompurify'

/** Проверяет, содержит ли строка HTML-теги */
export function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(content)
}

/** Убирает все HTML-теги, оставляя только текст (блочные теги → пробел) */
export function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Убирает HTML-теги, но сохраняет переносы строк (для цитат при пересылке) */
export function stripHtmlKeepNewlines(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Санитизация HTML для мессенджера — строгий whitelist тегов */
export function sanitizeMessengerHtml(dirty: string): string {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'blockquote',
      'ol',
      'ul',
      'li',
      'a',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}

/** Регулярка для URL в тексте */
const URL_REGEX = /(?:https?:\/\/|www\.)[\w\-._~:/?#[\]@!$&'()*+,;=%]+[\w\-_~/#=]/gi

/** Оборачивает URL в тексте в <a> теги. Для plain text — сначала экранирует HTML */
export function linkifyText(text: string): string {
  const escaped = escapeHtml(text)
  return escaped.replace(URL_REGEX, (url) => {
    const href = url.startsWith('www.') ? `https://${url}` : url
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })
}

/** Конвертирует plain text в простой HTML (для загрузки в Tiptap при редактировании старых сообщений) */
export function plainTextToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
