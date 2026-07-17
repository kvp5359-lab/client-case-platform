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
 * Проставляет `data-qn` на прямые `<li>` каждого `<ol>`/`<ul>` внутри root:
 * номер (с учётом `start`, каждый список нумеруется независимо) для `<ol>`,
 * «•» для `<ul>`. Работает и на живом DOM (для цитаты выделения — до
 * клонирования диапазона: тогда номера верны даже при частичном выделении).
 */
export function markListNumbers(root: ParentNode): void {
  root.querySelectorAll('ol').forEach((ol) => {
    const parsed = parseInt(ol.getAttribute('start') || '1', 10)
    let n = Number.isFinite(parsed) ? parsed : 1
    for (const li of Array.from(ol.children)) {
      if (li.tagName === 'LI') {
        li.setAttribute('data-qn', String(n))
        n += 1
      }
    }
  })
  root.querySelectorAll('ul').forEach((ul) => {
    for (const li of Array.from(ul.children)) {
      if (li.tagName === 'LI') li.setAttribute('data-qn', '•')
    }
  })
}

/** Превращает проставленный `data-qn` в текстовый префикс внутри `<li>`
 *  («1. » / «• ») и снимает атрибут — чтобы маркер попал в текст после strip. */
function applyMarkedNumbers(root: ParentNode): void {
  root.querySelectorAll('li[data-qn]').forEach((li) => {
    const qn = li.getAttribute('data-qn') || ''
    li.removeAttribute('data-qn')
    const marker = qn === '•' ? '• ' : `${qn}. `
    li.insertBefore(document.createTextNode(marker), li.firstChild)
  })
}

/**
 * HTML сообщения → текст цитаты С видимыми маркерами списков. Номера `<ol>` и
 * буллеты `<ul>` в HTML — это CSS-маркеры, а не текст, поэтому обычный strip их
 * теряет. Здесь мы восстанавливаем их как текст (клиент их видел — в цитате они
 * тоже должны быть). SSR / ошибка парсинга → фолбэк на `stripHtmlKeepNewlines`.
 */
export function htmlToQuoteText(html: string): string {
  if (!html) return ''
  if (typeof document === 'undefined') return stripHtmlKeepNewlines(html)
  try {
    const div = document.createElement('div')
    div.innerHTML = html
    markListNumbers(div)
    applyMarkedNumbers(div)
    return stripHtmlKeepNewlines(div.innerHTML)
  } catch {
    return stripHtmlKeepNewlines(html)
  }
}

/**
 * Текст цитаты из выделения в баббле С маркерами списков. Нумерует списки по
 * ЖИВОМУ DOM `container` (номера верны даже при частичном выделении), клонирует
 * диапазон (клон уносит `data-qn`), снимает стамп с живого DOM, проставляет
 * маркеры в клоне. Фолбэк — обычный текст выделения.
 */
export function quoteTextFromRange(range: Range, container: HTMLElement): string {
  const plain = range.toString().trim()
  if (typeof document === 'undefined') return plain
  try {
    markListNumbers(container)
    const frag = range.cloneContents()
    container.querySelectorAll('li[data-qn]').forEach((li) => li.removeAttribute('data-qn'))
    const div = document.createElement('div')
    div.appendChild(frag)
    applyMarkedNumbers(div)
    return stripHtmlKeepNewlines(div.innerHTML) || plain
  } catch {
    container.querySelectorAll('li[data-qn]').forEach((li) => li.removeAttribute('data-qn'))
    return plain
  }
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

/**
 * Разворачивает layout-таблицы маркетинговых писем (Stripe/Gmail/Outlook
 * рендерят КАЖДУЮ строку текста как `<table><tbody><tr><td><span>…`). Такие
 * одно-ячеечные таблицы вложены на 5-7 уровней → наш CSS `.messenger-content
 * table { margin } / td { padding }` накапливает левый отступ (визуальный
 * сдвиг текста вправо) и вертикальные зазоры (пустые строки между строчками).
 *
 * Разворачиваем ТОЛЬКО таблицы с ровно одной собственной ячейкой (обёртки) —
 * заменяем `<table>` на `<div>` с содержимым ячейки. Реальные таблицы данных
 * (строки чека «метка | сумма», 2+ ячеек) не трогаем — выравнивание колонок
 * сохраняется. Идём от глубоких к внешним: после разворота внутренней обёртки
 * внешняя тоже становится одно-ячеечной и сворачивается.
 */
function unwrapLayoutTables(root: Element): void {
  const ownCellCount = (table: Element): number =>
    Array.from(table.querySelectorAll('td, th')).filter(
      (cell) => cell.closest('table') === table,
    ).length
  // Глубина вложенности таблиц — сортируем по убыванию, чтобы внутренние
  // обёртки разворачивались первыми.
  const depthOf = (el: Element): number => {
    let d = 0
    let p = el.parentElement
    while (p) {
      if (p.tagName === 'TABLE') d++
      p = p.parentElement
    }
    return d
  }
  const tables = Array.from(root.querySelectorAll('table')).sort(
    (a, b) => depthOf(b) - depthOf(a),
  )
  for (const table of tables) {
    if (ownCellCount(table) !== 1) continue
    const cell = Array.from(table.querySelectorAll('td, th')).find(
      (c) => c.closest('table') === table,
    )
    if (!cell) continue
    const div = document.createElement('div')
    while (cell.firstChild) div.appendChild(cell.firstChild)
    table.replaceWith(div)
  }
}

/**
 * Невидимые символы-распорки. Маркетинговые письма набивают «preheader»
 * (скрытый текст превью) комбинирующими/zero-width символами: combining
 * grapheme joiner (U+034F), soft hyphen (U+00AD, рисуется как «-»), zero-width
 * space/joiner, word joiner, BOM. Так как мы режем `display:none` (чтобы письма
 * не прятали реальный контент), preheader становится видимым — куча «пустых»
 * строк + артефакт «-». Вычищаем эти символы из текстовых узлов → блок
 * становится визуально пустым и сворачивается collapseEmptyLines.
 */
const INVISIBLE_CHARS = /[\u00AD\u034F\u200B\u200C\u200D\u2060\uFEFF]/g

// Символы-распорки фиксированной ширины, которые НЕ схлопываются под
// white-space:normal (в отличие от обычного пробела) → сотня подряд в
// preheader даёт высокий пустой бокс. Конвертируем в обычный пробел:
//   figure U+2007, en/em/thin U+2000–U+200A, narrow/medium U+202F/U+205F,
//   ideographic U+3000, BRAILLE PATTERN BLANK U+2800 (печатный «пробел»,
//   Госуслуги и др. набивают им preheader, часто + color:transparent).
const FIXED_WIDTH_SPACES = /[\u2000-\u200A\u202F\u205F\u2800\u3000]/g
function stripInvisibleChars(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) texts.push(n as Text)
  for (const t of texts) {
    const cleaned = t.data.replace(INVISIBLE_CHARS, '').replace(FIXED_WIDTH_SPACES, ' ')
    if (cleaned !== t.data) t.data = cleaned
  }
}

/**
 * Спейсер-ячейки писем. Маркетинговые письма (AliExpress и др.) держат вертикаль
 * невидимыми ячейками-распорками: `<td style="font-size:0;line-height:0;
 * color:#FFF">.</td>` — точка, спрятанная нулевым размером шрифта и белым
 * цветом. Наш `restrictInlineStyles` срезает `font-size`/`color` (их нет в белом
 * списке) → точка всплывает обычным размером, а ячейка перестаёт быть «пустой»
 * (в ней есть «.») и не сворачивается. Поэтому ДО фильтрации стилей чистим
 * прямой текст у элементов с `font-size:0` — они невидимы по замыслу письма.
 * Чистим только прямые текст-узлы (не потомков с собственным размером шрифта),
 * чтобы не задеть реальный контент внутри font-size:0-обёртки.
 */
function stripZeroFontSpacers(root: Element): void {
  root.querySelectorAll('[style]').forEach((el) => {
    const style = (el.getAttribute('style') ?? '').toLowerCase()
    if (!/font-size\s*:\s*0(px|em|rem|%)?\s*(;|$)/.test(style)) return
    el.childNodes.forEach((node) => {
      if (node.nodeType === 3) node.textContent = ''
    })
  })
}

/**
 * Снимает презентационный атрибут `height` у элементов письма. Маркетинговые
 * письма держат вертикаль (кнопки-баннеры, распорки) ячейками `<td height="50">`
 * и картинками `<img height="136">`. Inline `height:…px` мы срезаем в
 * restrictInlineStyles, но HTML-АТРИБУТ `height` остаётся и резервирует пустой
 * бокс своей высоты, когда картинка не загрузилась (внешние картинки писем
 * часто режутся) — а ячейка не считается «пустой» (внутри есть `<img>`), поэтому
 * collapseEmptyLines её не сворачивает. Убираем `height` → элемент сжимается по
 * контенту (0 у незагруженной картинки, см. также CSS `.messenger-content img
 * { height: auto }`). Ширину НЕ трогаем: вертикальных гэпов она не создаёт, а у
 * таблиц данных держит выравнивание колонок.
 */
function stripFixedHeights(root: Element): void {
  root.querySelectorAll('[height]').forEach((el) => el.removeAttribute('height'))
}

/**
 * Убирает ведущие/замыкающие `<br>` ВНУТРИ блоков. Санитайзер вырезает `<img>`
 * (нет в ALLOWED_TAGS), и блоки-контейнеры картинок пустеют → collapseEmptyLines
 * превращает их в `<br>`. Получаются «висячие» пустые строки в начале ячеек
 * (реально измерено: `<td><div><br><br><a>Товар…</a>`) — 2-3 `<br>` дают
 * вертикальный гэп 40-67px перед каждым товаром/блоком. Такие `<br>` на КРАЯХ
 * блока — мусор: осмысленный пустой абзац стоит МЕЖДУ блоками, а не первым/
 * последним ребёнком. Чистим только края (leading/trailing), `<br>` между двумя
 * строками текста не трогаем. Замер на живом письме AliExpress: высота бабла
 * 1034px → 827px, число `<br>` 12 → 2.
 *
 * ⚠️ Чистим ТОЛЬКО контейнеры email-мусора (div/td/th/a) — там edge-`<br>` это
 * остаток вырезанной картинки. `p`/`li`/`blockquote` НЕ трогаем: в наших
 * сообщениях из редактора хвостовой `<br>` внутри `<p>` = осознанная пустая
 * строка (в Telegram `</p><p>` → `\n\n`, видна). Раньше срезали и её → абзацы
 * слипались, часть пустых строк пропадала (в TG были, в баббле нет).
 */
function trimInnerEdgeBreaks(root: Element): void {
  const isBlankEdge = (n: ChildNode | null): boolean =>
    !!n &&
    ((n.nodeType === 1 && (n as Element).tagName === 'BR') ||
      (n.nodeType === 3 && (n.textContent ?? '').replace(/\s/g, '') === ''))
  root.querySelectorAll('div, td, th, a').forEach((el) => {
    while (el.firstChild && isBlankEdge(el.firstChild)) el.firstChild.remove()
    while (el.lastChild && isBlankEdge(el.lastChild)) el.lastChild.remove()
  })
}

/**
 * Выносит хвостовой `<br>` из `<p>` наружу как соседний `<br>` после блока.
 * Причина (замерено в браузере): хвостовой `<br>` ВНУТРИ `<p>текст.<br></p>`
 * браузер НЕ рисует (высоты не даёт, gap=0) — а именно так tiptap кодирует
 * пустую строку в конце абзаца. При этом в Telegram `<br>`+`</p>` = `\n\n`
 * (пустая строка видна) → баббл расходился с Telegram. `<br>` МЕЖДУ блоками
 * рисуется как пустая строка (gap≈17). Поэтому переносим хвостовой `<br>`
 * из `<p>` в позицию сразу после него. Работает и для абзацев внутри `<li>`
 * (tiptap: `<li><p>…<br></p></li>`) — `<br>` остаётся внутри `<li>`.
 * Хвостовой `<br>` в самом конце сообщения потом срежет trimEdgeWhitespaceHtml.
 */
function moveTrailingParaBreaks(root: Element): void {
  root.querySelectorAll('p').forEach((el) => {
    // Абзац из ОДНИХ <br> (пустые строки) не трогаем: он и так рисуется пустыми
    // строками, а вынос всех <br> оставил бы невидимый огрызок <p></p>, который
    // при копировании в редактор дал бы лишнюю пустую строку.
    const hasContent = Array.from(el.childNodes).some(
      (n) =>
        !(n.nodeType === 1 && (n as Element).tagName === 'BR') &&
        !(n.nodeType === 3 && (n.textContent ?? '').trim() === ''),
    )
    if (!hasContent) return
    while (el.lastChild && el.lastChild.nodeType === 1 &&
           (el.lastChild as Element).tagName === 'BR') {
      const br = el.lastChild
      el.removeChild(br)
      el.after(br)
    }
  })
}

/**
 * Финальная нормализация пустых строк: разделители-`<br>` между блоками (прямые
 * дети root) → один `<p><br></p>`. Bare `<br>` между блоками рисуется пустой
 * строкой, НО при копировании из бабла сериализуется грязно → при вставке в
 * редактор пустая строка ДВОИЛАСЬ (её приходилось стирать вручную). `<p><br></p>`
 * рисуется так же (замер: зазор 17) и round-trip'ится в tiptap как РОВНО одна
 * пустая строка (замер настоящей вставки). Внутриабзацные `<br>` (перенос строки
 * внутри `<p>`) и вложенный email-контент (в `div`/`td`) — НЕ прямые дети root,
 * не трогаются. Ведущие/замыкающие разделители снимаются (нет пустых строк по
 * краям бабла).
 *
 * `collapseRuns`: true (email) — группа подряд идущих `<br>` → одна пустая
 * строка; false (обычные сообщения) — каждая `<br>` группы → своя `<p><br></p>`
 * (количество пустых строк сохраняется 1:1, ничего не схлопываем).
 */
function normalizeRootBlankLines(root: Element, collapseRuns: boolean): void {
  const BLOCK = new Set([
    'P', 'DIV', 'BLOCKQUOTE', 'OL', 'UL', 'LI',
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
  ])
  const isBr = (n: ChildNode | null): boolean =>
    !!n && n.nodeType === 1 && (n as Element).tagName === 'BR'
  const isBlankText = (n: ChildNode | null): boolean =>
    !!n && n.nodeType === 3 && (n.textContent ?? '').trim() === ''
  const isBlockEl = (n: ChildNode | null): boolean =>
    !!n && n.nodeType === 1 && BLOCK.has((n as Element).tagName)
  const meaningfulPrev = (n: ChildNode): ChildNode | null => {
    let p = n.previousSibling
    while (isBlankText(p)) p = p!.previousSibling
    return p
  }
  // Края: снять ведущие/замыкающие root-level <br> (пустые строки на краях бабла).
  while (root.firstChild && (isBr(root.firstChild) || isBlankText(root.firstChild)))
    root.firstChild.remove()
  while (root.lastChild && (isBr(root.lastChild) || isBlankText(root.lastChild)))
    root.lastChild.remove()
  let node: ChildNode | null = root.firstChild
  while (node) {
    if (isBr(node)) {
      // Собрать группу подряд идущих <br> (+ пробельные узлы между ними).
      const run: ChildNode[] = [node]
      let cur: ChildNode | null = node.nextSibling
      while (cur && (isBr(cur) || isBlankText(cur))) {
        run.push(cur)
        cur = cur.nextSibling
      }
      // Разделитель ПУСТОЙ СТРОКИ (→ <p><br></p>) — только если <br> стоит МЕЖДУ
      // блоками (сосед-блок хотя бы с одной стороны). Если оба соседа инлайновые
      // (текст) — это ПЕРЕНОС СТРОКИ внутри плоского текста (plain-text из TG:
      // `Привет!<br>Подготовил`), его НЕ трогаем, иначе появлялась лишняя пустая
      // строка (баг 2026-07-08).
      const isSeparator = isBlockEl(meaningfulPrev(node)) || isBlockEl(cur)
      if (isSeparator) {
        const brCount = run.filter((n) => isBr(n)).length
        const lines = collapseRuns ? 1 : brCount
        const frag = document.createDocumentFragment()
        for (let i = 0; i < lines; i++) {
          const p = document.createElement('p')
          p.appendChild(document.createElement('br'))
          frag.appendChild(p)
        }
        node.replaceWith(frag)
        for (let i = 1; i < run.length; i++) run[i].remove()
      }
      node = cur
    } else {
      node = node.nextSibling
    }
  }
}

function collapseEmptyLines(html: string): string {
  if (typeof document === 'undefined') return collapseEmptyLinesRegex(html)

  const root = document.createElement('div')
  root.innerHTML = html

  stripInvisibleChars(root)
  stripZeroFontSpacers(root)
  stripFixedHeights(root)
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

  unwrapLayoutTables(root)
  trimInnerEdgeBreaks(root)
  moveTrailingParaBreaks(root)
  normalizeRootBlankLines(root, true)

  let result = root.innerHTML
  // 3+ подряд <br> → 2 (= одна пустая строка).
  result = result.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  return trimEdgeWhitespaceHtml(result)
}

/**
 * Пайплайн ОБЫЧНЫХ (не-email) сообщений: пустые строки НЕ схлопываются —
 * сколько автор набрал в редакторе, столько и видно в бабле (1:1 с полем
 * ввода/пересылкой). Email-чистки (preheader'ы, layout-таблицы, потолок
 * «максимум одна пустая подряд») сюда не применяются — они писались под
 * мусор почтовых рассылок и прятали осознанные пустые строки автора.
 *
 * Что делаем:
 * 1. Пустой абзац `<p></p>` → `<p><br></p>`: в бабле у абзацев margin:0,
 *    пустой `<p>` имеет НУЛЕВУЮ высоту (в редакторе это одна пустая строка) —
 *    без этого пустые строки автора просто исчезали бы.
 * 2. Хвостовой `<br>` из `<p>` наружу (фикс 2026-07-08: браузер его не рисует,
 *    а Telegram рисует).
 * 3. Root-level `<br>`-разделители → `<p><br></p>` ПОШТУЧНО (без схлопывания
 *    группы) — чисто копируется в редактор, количество сохраняется.
 * 4. Крайняя пустота (bare `<br>`/пробелы по краям) обрезается, как и раньше.
 */
function normalizeMessageBlankLines(html: string): string {
  if (typeof document === 'undefined') return normalizeMessageBlankLinesRegex(html)

  const root = document.createElement('div')
  root.innerHTML = html

  // Защита вёрстки бабла от inline-стилей вставленного контента — не чистка
  // пустых строк, оставляем для обоих типов сообщений.
  restrictInlineStyles(root)

  // Пустой <p></p> (без <br> и текста) → видимая пустая строка. Абзацы, уже
  // содержащие <br>, не трогаем — они рисуются сами.
  root.querySelectorAll('p').forEach((p) => {
    const empty = Array.from(p.childNodes).every(
      (n) => n.nodeType === 3 && (n.textContent ?? '').trim() === '',
    )
    if (empty) {
      p.textContent = ''
      p.appendChild(document.createElement('br'))
    }
  })

  moveTrailingParaBreaks(root)
  normalizeRootBlankLines(root, false)

  return trimEdgeWhitespaceHtml(root.innerHTML)
}

/** SSR-fallback для normalizeMessageBlankLines: только `<p></p>` → `<p><br></p>`
 *  и обрезка краёв, без обхода DOM. */
function normalizeMessageBlankLinesRegex(html: string): string {
  const curr = html.replace(/<p(\s[^>]*)?>\s*<\/p>/gi, '<p$1><br></p>')
  return trimEdgeWhitespaceHtml(curr)
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
 * (style, class) всё равно вычищаются — рендерим только семантику.
 *
 * `opts.email` — контент письма: применяется полный пайплайн email-чисток
 * (схлопывание пустых строк, preheader'ы, layout-таблицы). Для обычных
 * сообщений (дефолт) пустые строки НЕ схлопываются — бабл показывает ровно
 * то, что набрано в редакторе (иначе пересылка «оригиналом» выглядела бы
 * иначе, чем бабл). Определять флаг по `isEmailSource(message.source)`. */
export function sanitizeMessengerHtml(dirty: string, opts?: { email?: boolean }): string {
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
  return opts?.email ? collapseEmptyLines(clean) : normalizeMessageBlankLines(clean)
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

/** Экранирование текст-контента (& < >) для вставки в HTML. Для значений
 *  атрибутов недостаточно — там нужно экранировать и кавычки. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
