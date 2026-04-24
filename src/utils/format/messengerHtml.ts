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

/**
 * Превью ответа для списка чатов / уведомлений: сначала вырезает все
 * `<blockquote>…</blockquote>` (цитируемые сообщения), затем снимает остальные
 * теги. Если после вырезания цитаты ничего не осталось (сообщение состоит
 * только из цитаты) — возвращает полный текст, включая цитату, как fallback.
 */
export function stripHtmlIgnoreQuotes(html: string): string {
  if (!html) return ''
  const withoutQuotes = html.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, '')
  const stripped = stripHtml(withoutQuotes)
  return stripped || stripHtml(html)
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
    FORBID_ATTR: [],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  })
}

/** Регулярка для URL в тексте */
const URL_REGEX = /(?:https?:\/\/|www\.)[\w\-._~:/?#[\]@!$&'()*+,;=%]+[\w\-_~/#=]/gi

/** Оборачивает URL в тексте в <a> теги. Для plain text — сначала экранирует HTML */
export function linkifyText(text: string): string {
  const escaped = escapeHtml(text)
  return escaped.replace(URL_REGEX, (url) => {
    const href = url.startsWith('www.') ? `https://${url}` : url
    return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })
}

/**
 * Оборачивает URL в <a> внутри уже готового HTML-сообщения.
 * Обходит только текстовые узлы, не трогает уже существующие <a> —
 * безопасно для содержимого из Tiptap, где ссылки могут приходить без
 * анкоров, но теги разметки оставлять нужно.
 */
export function linkifyHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html
  const container = document.createElement('div')
  container.innerHTML = html

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('a')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })

  const textNodes: Text[] = []
  let current: Node | null
  while ((current = walker.nextNode())) textNodes.push(current as Text)

  for (const text of textNodes) {
    const parent = text.parentNode
    if (!parent) continue
    URL_REGEX.lastIndex = 0
    if (!URL_REGEX.test(text.data)) continue
    URL_REGEX.lastIndex = 0

    const frag = document.createDocumentFragment()
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = URL_REGEX.exec(text.data))) {
      const before = text.data.slice(lastIndex, match.index)
      if (before) frag.appendChild(document.createTextNode(before))
      const url = match[0]
      const href = url.startsWith('www.') ? `https://${url}` : url
      const a = document.createElement('a')
      a.href = href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = url
      frag.appendChild(a)
      lastIndex = match.index + url.length
    }
    const tail = text.data.slice(lastIndex)
    if (tail) frag.appendChild(document.createTextNode(tail))

    parent.replaceChild(frag, text)
  }

  return container.innerHTML
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
