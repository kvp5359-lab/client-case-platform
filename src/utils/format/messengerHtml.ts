/**
 * Утилиты для работы с HTML-контентом мессенджера
 */
import DOMPurify from 'dompurify'

/** Проверяет, содержит ли строка HTML-теги */
export function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(content)
}

/**
 * Декодирует HTML entities (&nbsp;, &amp;, &lt;, &#39; и т.п.) в plain text.
 * В браузере — через DOMParser/textarea; на сервере (SSR) — fallback на
 * ручной replace основных entities. Иначе превью email'ов в тостах/списках
 * показывает «&nbsp;&nbsp;Estimado cliente…».
 */
function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea')
    el.innerHTML = text
    return el.value
  }
  // SSR fallback: декодируем самые частые entities + numeric refs
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

/** Убирает все HTML-теги, оставляя только текст (блочные теги → пробел) */
export function stripHtml(html: string): string {
  if (!html) return ''
  const noTags = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
  return decodeHtmlEntities(noTags).replace(/\s+/g, ' ').trim()
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

/**
 * Схлопывает «пустые строки» в email-HTML: пустые блоки `<div></div>` /
 * `<p><br></p>` (Gmail и Outlook щедро вставляют их между абзацами) и подряд
 * идущие `<br>`. На выходе — максимум одна пустая строка подряд.
 */
function collapseEmptyLines(html: string): string {
  let prev: string
  let curr = html
  // Пустые блоки → один <br>. Повторяем, пока находятся вложенные пустые.
  do {
    prev = curr
    curr = curr.replace(
      /<(div|p)(?:\s[^>]*)?>\s*(?:<br\s*\/?>\s*)*<\/\1>/gi,
      '<br>',
    )
  } while (curr !== prev)
  // 3+ подряд <br> → 2 (= одна пустая строка).
  curr = curr.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return curr
}

/** Санитизация HTML для мессенджера — строгий whitelist тегов.
 *
 * div/span включены, потому что email-клиенты (Gmail в первую очередь)
 * рендерят абзацы как `<div>...</div><div><br></div><div>...</div>`. Без
 * div'ов после санитизации абзацы слипались в одну строку. Атрибуты
 * (style, class) всё равно вычищаются — рендерим только семантику. */
export function sanitizeMessengerHtml(dirty: string): string {
  if (!dirty) return ''
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'div',
      'span',
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
  return collapseEmptyLines(clean)
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
