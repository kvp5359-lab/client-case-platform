/**
 * Конвертация Tiptap HTML → Telegram-совместимый HTML.
 * Скопировано из supabase/functions/_shared/htmlFormatting.ts.
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

  result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_match, inner: string) => {
    let counter = 0
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, content: string) => {
      counter++
      const clean = content.replace(/<p>/g, "").replace(/<\/p>/g, "")
      return `${counter}. ${clean}\n`
    })
  })

  result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_match, inner: string) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, content: string) => {
      const clean = content.replace(/<p>/g, "").replace(/<\/p>/g, "")
      return `• ${clean}\n`
    })
  })

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
