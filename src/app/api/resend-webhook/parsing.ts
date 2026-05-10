import { stripEmailQuotes, stripHtmlQuotes, type ParsedAddress } from '@/lib/resendWebhook'
import { ROOT_DOMAIN, type ResendEmailData } from './types'

/**
 * Подбираем содержимое для project_messages.content. CHECK constraint
 * требует длину > 0, поэтому при отсутствии html/text от Resend кладём
 * subject либо плейсхолдер.
 */
export function pickContent(data: ResendEmailData): string {
  const html = data.html?.trim()
  if (html) return stripHtmlQuotes(html)
  const text = data.text?.trim()
  if (text) {
    const cleaned = stripEmailQuotes(text)
    const escaped = cleaned
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
    return `<p>${escaped}</p>`
  }
  const subject = data.subject?.trim()
  if (subject) return `<p><i>(Тема:)</i> ${escapeHtml(subject)}</p>`
  return '<p><i>(пустое тело письма)</i></p>'
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function pickPlatformRecipient(
  toList: ParsedAddress[],
  ccList: ParsedAddress[],
): ParsedAddress | null {
  const all = [...toList, ...ccList]
  return all.find((a) => isPlatformAddress(a.address)) ?? all[0] ?? null
}

export function isPlatformAddress(address: string): boolean {
  return address.toLowerCase().endsWith('.' + ROOT_DOMAIN)
}

export function normalizeAddressList(
  src: ResendEmailData['from'] | ResendEmailData['to'] | ResendEmailData['cc'],
): ParsedAddress[] {
  if (!src) return []
  const arr = Array.isArray(src) ? src : [src]
  const result: ParsedAddress[] = []
  for (const item of arr) {
    if (typeof item === 'string') {
      const parsed = parseAddress(item)
      if (parsed) result.push(parsed)
    } else if (item && typeof item === 'object' && 'email' in item && item.email) {
      result.push({ address: item.email, name: item.name })
    }
  }
  return result
}

export function parseAddress(input: string | null | undefined): ParsedAddress | null {
  if (!input) return null
  const angle = input.match(/^\s*(?:"?([^"<]+?)"?\s*)?<\s*([^>\s]+@[^>\s]+)\s*>\s*$/)
  if (angle) {
    return { address: angle[2].trim(), name: angle[1]?.trim() || undefined }
  }
  const bare = input.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)
  if (bare) return { address: bare[1].trim() }
  return null
}

export function normalizeHeaders(
  headers: ResendEmailData['headers'] | undefined,
): Record<string, string> {
  if (!headers) return {}
  const out: Record<string, string> = {}
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h?.name) out[h.name.toLowerCase()] = h.value
    }
  } else {
    for (const [k, v] of Object.entries(headers)) {
      out[k.toLowerCase()] = String(v)
    }
  }
  return out
}
