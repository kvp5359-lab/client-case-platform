/**
 * Извлекает http(s)-ссылки из содержимого сообщения (может быть HTML).
 * Ловит и голые URL в тексте, и href из <a>. Дедуп с сохранением порядка.
 */
const URL_RE = /https?:\/\/[^\s<>"')]+/gi

/** Обрезает хвостовую пунктуацию, прилипшую к URL в тексте. */
function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/, '')
}

export function extractLinks(content: string | null | undefined): string[] {
  if (!content) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of content.matchAll(URL_RE)) {
    const url = trimTrailing(raw[0])
    if (url.length < 8) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** Компактная подпись ссылки: домен + начало пути, без протокола. */
export function linkLabel(url: string): string {
  const noProto = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  return noProto.length > 48 ? `${noProto.slice(0, 47)}…` : noProto
}
