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
    .replace(/<\/(?:p|div|li|blockquote|h[1-6]|td|th|tr|caption)>/gi, ' ')
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
    .replace(/<\/(?:p|div|li|blockquote|h[1-6]|tr|caption)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Схлопывает «пустые строки» в email-HTML: пустые блоки `<div></div>`,
 * `<p><br></p>`, `<p>&nbsp;</p>`, `<div><span>&nbsp;</span></div>` и так далее
 * (Gmail / Outlook / маркетинговые рассылки щедро ставят их между абзацами).
 * Плюс подряд идущие `<br>`. На выходе — максимум одна пустая строка подряд.
 *
 * Основной путь — обход DOM: «визуально пустой» = только whitespace, `&nbsp;`
 * и/или `<br>` внутри, без img/svg/hr/picture/video/audio. Для SSR (где нет
 * document) — fallback на regex.
 */
/** Обрезает пустоту (пробелы, &nbsp;, <br>) по краям HTML. Email-клиенты
 *  (Gmail) часто оставляют хвост из `<br><br>&nbsp;` + пустых блоков — после
 *  схлопывания он давал видимую пустую полосу под сообщением. */
function trimEdgeWhitespaceHtml(html: string): string {
  const EDGE = /^(?:\s|&nbsp;|&#160;|&#xA0;|<br\s*\/?>)+|(?:\s|&nbsp;|&#160;|&#xA0;|<br\s*\/?>)+$/gi
  return html.replace(EDGE, '')
}

/** Белый список inline-CSS, который оставляем у элементов письма. Только
 *  «косметика» — цвет/жирность/фон/выравнивание/отступы/скругление. НЕ пускаем
 *  width/height/position/float/margin — они ломают вёрстку внутри узкого бабла
 *  (фиксированные 600px, плавающие блоки, наезды). */
const ALLOWED_CSS_PROPS = new Set([
  'color',
  'font-weight',
  'font-style',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
])
/** Парсит CSS-цвет (#rgb/#rrggbb/rgb()/rgba()/white/black) в RGB. null — если
 *  не распознали (тогда цвет оставляем как есть). */
function parseColorRgb(v: string): { r: number; g: number; b: number } | null {
  const s = v.trim().toLowerCase()
  if (s === 'white') return { r: 255, g: 255, b: 255 }
  if (s === 'black') return { r: 0, g: 0, b: 0 }
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const h = hex[1]
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    }
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] }
  return null
}

/** Светлый текст письма (расчёт на цветной фон) нечитаем на светлом баббле.
 *  Отбрасываем такие цвета → текст падает на тёмный дефолт баббла. Тёмные и
 *  насыщенные цвета (синие ссылки, чёрный текст) остаются. */
function isTooLightForBubble(color: string): boolean {
  const rgb = parseColorRgb(color)
  if (!rgb) return false
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.65
}

/** Оставляет в style только свойства из белого списка; режет url()/expression
 *  и слишком светлый цвет текста (нечитаемый на баббле). */
function filterStyleAttr(style: string): string {
  const kept: string[] = []
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (!val || !ALLOWED_CSS_PROPS.has(prop)) continue
    const low = val.toLowerCase()
    if (low.includes('url(') || low.includes('expression') || low.includes('javascript:')) continue
    if (prop === 'color' && isTooLightForBubble(val)) continue
    kept.push(`${prop}: ${val}`)
  }
  return kept.join('; ')
}

/** Прогоняет все inline-стили письма через белый список (см. filterStyleAttr). */
function restrictInlineStyles(root: Element): void {
  root.querySelectorAll('[style]').forEach((el) => {
    const filtered = filterStyleAttr(el.getAttribute('style') ?? '')
    if (filtered) el.setAttribute('style', filtered)
    else el.removeAttribute('style')
  })
}

function collapseEmptyLines(html: string): string {
  if (typeof document === 'undefined') return collapseEmptyLinesRegex(html)

  const root = document.createElement('div')
  root.innerHTML = html

  restrictInlineStyles(root)

  const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'OL', 'UL', 'LI'])
  // Пустые элементы таблиц (ячейки-распорки, строки под вырезанные картинки)
  // не схлопываем в <br> (сломало бы структуру таблицы), а УДАЛЯЕМ целиком —
  // иначе layout-таблицы маркетинговых писем оставляют большие пустые боксы и
  // сдвиги текста.
  const TABLE_TAGS = new Set([
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'COL',
  ])
  const NON_EMPTY_DESCENDANTS = 'img, svg, hr, picture, video, audio'

  const isVisuallyEmpty = (el: Element): boolean => {
    if (el.querySelector(NON_EMPTY_DESCENDANTS)) return false
    // textContent + удалить все whitespace и неразрывные пробелы.
    const text = (el.textContent ?? '').replace(/[\s ]/g, '')
    return text.length === 0
  }

  // Post-order: сначала глубокие потомки, потом текущий узел. Так пустой
  // <div><span></span></div> схлопнется до <br>, а его родитель — заметит,
  // что стал тоже пустым (содержит лишь <br>), и тоже схлопнется.
  const walk = (node: Element) => {
    const children = Array.from(node.children)
    for (const child of children) walk(child)
    if (!node.parentElement) return
    if (TABLE_TAGS.has(node.tagName) && isVisuallyEmpty(node)) {
      node.remove()
    } else if (BLOCK_TAGS.has(node.tagName) && isVisuallyEmpty(node)) {
      const br = document.createElement('br')
      node.replaceWith(br)
    }
  }

  Array.from(root.children).forEach(walk)

  let result = root.innerHTML
  // 3+ подряд <br> → 2 (= одна пустая строка).
  result = result.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return trimEdgeWhitespaceHtml(result)
}

/** SSR-fallback. Покрывает базовые случаи `<div></div>` / `<p><br></p>` /
 *  `<p>&nbsp;</p>` без обхода DOM. */
function collapseEmptyLinesRegex(html: string): string {
  let prev: string
  let curr = html
  do {
    prev = curr
    curr = curr.replace(
      /<(div|p|blockquote|li|ol|ul)(?:\s[^>]*)?>(?:\s|&nbsp;|&#160;|&#xA0;|<br\s*\/?>)*<\/\1>/gi,
      '<br>',
    )
  } while (curr !== prev)
  curr = curr.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return trimEdgeWhitespaceHtml(curr)
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
      // Таблицы из писем (Gmail/Outlook рендерят формы-заявки таблицей).
      // Без них теги вырезались и ячейки слипались в сплошной текст.
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'caption',
      'colgroup',
      'col',
    ],
    // style/align пропускаем, но style потом режется белым списком CSS-свойств
    // (restrictInlineStyles) — иначе письма ломали вёрстку бабла.
    ALLOWED_ATTR: ['href', 'target', 'rel', 'start', 'type', 'colspan', 'rowspan', 'style', 'align'],
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
