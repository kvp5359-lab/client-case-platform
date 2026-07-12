/**
 * Конвертация Tiptap HTML → Telegram-совместимый HTML.
 * ⚠️ ПАРИТЕТ с supabase/functions/_shared/htmlFormatting.ts — держать синхронно
 * (иерархическая нумерация списков 1/1.1 + уважение <ol start=>). Тест-паритет
 * в tests/htmlFormatting-parity.test.ts (корень репо, сверяет обе копии).
 * Telegram (и Bot API, и MTProto) поддерживает: <b>, <i>, <u>, <s>, <code>,
 * <pre>, <blockquote>, <a href="">. Остальное надо разворачивать в текст.
 */

export function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(content)
}

export function escapeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Индекс закрывающего </tag> для тега, открытого на fromIdx, с учётом
 *  вложенности того же тега (например, <ol> внутри <ol>). */
function findMatchingClose(html: string, fromIdx: number, tag: string): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "ig")
  re.lastIndex = fromIdx
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m[1] === "/") {
      depth--
      if (depth === 0) return m.index
    } else {
      depth++
    }
  }
  return html.length
}

/** Прямые <li> содержимого списка (вложенные <li> пропускаются). */
function splitDirectListItems(inner: string): string[] {
  const items: string[] = []
  let pos = 0
  while (true) {
    const open = inner.slice(pos).match(/<li\b[^>]*>/i)
    if (!open || open.index === undefined) break
    const start = pos + open.index + open[0].length
    const close = findMatchingClose(inner, start, "li")
    items.push(inner.slice(start, close))
    pos = close + "</li>".length
  }
  return items
}

/**
 * Рекурсивно конвертирует <ol>/<ul> в текст. Нумерованные — иерархически:
 * верхний уровень 1, 2…, вложенные — prefix.N (1.1, 1.2…). Уважает start у <ol>.
 * Telegram не поддерживает <ol>/<ul>/<li>.
 */
function listsToText(html: string, prefix = ""): string {
  let out = ""
  let pos = 0
  const openRe = /<(ol|ul)\b([^>]*)>/i
  while (true) {
    const rest = html.slice(pos)
    const m = rest.match(openRe)
    if (!m || m.index === undefined) {
      out += rest
      break
    }
    const tag = (m[1] ?? "").toLowerCase()
    const attrs = m[2] ?? ""
    const openStart = pos + m.index
    const openEnd = openStart + m[0].length
    out += html.slice(pos, openStart)
    const closeIdx = findMatchingClose(html, openEnd, tag)
    const inner = html.slice(openEnd, closeIdx)
    out += renderListItems(inner, tag, attrs, prefix)
    pos = closeIdx + `</${tag}>`.length
  }
  return out
}

function renderListItems(
  inner: string,
  tag: string,
  attrs: string,
  prefix: string,
): string {
  const items = splitDirectListItems(inner)
  let counter = 0
  if (tag === "ol") {
    const sm = attrs.match(/\bstart\s*=\s*["']?(\d+)/i)
    counter = sm ? parseInt(sm[1] ?? "1", 10) - 1 : 0
  }
  let out = ""
  for (const item of items) {
    // Текст пункта — до первого вложенного списка; вложенные — рекурсивно.
    const nestedAt = item.search(/<(ol|ul)\b/i)
    const textPart = nestedAt === -1 ? item : item.slice(0, nestedAt)
    const nestedPart = nestedAt === -1 ? "" : item.slice(nestedAt)
    const text = textPart.replace(/<\/?p\b[^>]*>/gi, "").trim()
    if (tag === "ol") {
      counter++
      const label = `${prefix}${counter}`
      out += `${label}. ${text}\n`
      if (nestedPart) out += listsToText(nestedPart, `${label}.`)
    } else {
      out += `• ${text}\n`
      if (nestedPart) out += listsToText(nestedPart, prefix)
    }
  }
  return out
}

export function htmlToTelegramHtml(html: string): string {
  let result = html

  result = result.replace(/<strong>/g, "<b>").replace(/<\/strong>/g, "</b>")
  result = result.replace(/<em>/g, "<i>").replace(/<\/em>/g, "</i>")

  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_m, inner: string) =>
    `\n\n<b>━━━ ${inner.trim()} ━━━</b>\n\n`,
  )
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_m, inner: string) =>
    `\n\n<b>▸ ${inner.trim()}</b>\n\n`,
  )
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_m, inner: string) =>
    `\n\n<b>${inner.trim()}</b>\n\n`,
  )
  result = result.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/g, (_m, inner: string) =>
    `\n\n<b><i>${inner.trim()}</i></b>\n\n`,
  )

  // Списки → текст. Нумерованные — иерархически (1, 1.1, 1.2…), уважают start.
  result = listsToText(result)

  result = result.replace(/<p><br\s*\/?><\/p>/g, "\n")
  result = result.replace(/<p><\/p>/g, "\n")
  result = result.replace(/<p>/g, "").replace(/<\/p>/g, "\n")
  result = result.replace(/<br\s*\/?>/g, "\n")
  result = result.replace(
    /<(?!\/?(?:b|i|u|s|code|pre|blockquote|a)\b)[^>]*>/g,
    "",
  )
  result = result.replace(/&nbsp;/g, " ")
  result = result.replace(/\n+$/, "")

  return result
}
