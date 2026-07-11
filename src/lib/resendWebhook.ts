import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Resend шлёт webhook'и через Svix. Подпись HMAC-SHA256 от
 * `${svix_id}.${svix_timestamp}.${rawBody}`, секрет — base64
 * после префикса `whsec_`. Заголовок `svix-signature` содержит
 * через пробел подписи в формате `v1,<base64>`. Свежесть — ±5 минут.
 */
const TOLERANCE_SECONDS = 5 * 60

export type SvixHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export function getSvixHeaders(headers: Headers): SvixHeaders {
  return {
    id: headers.get('svix-id') ?? headers.get('webhook-id'),
    timestamp: headers.get('svix-timestamp') ?? headers.get('webhook-timestamp'),
    signature: headers.get('svix-signature') ?? headers.get('webhook-signature'),
  }
}

export function verifySvixSignature(opts: {
  rawBody: string
  headers: SvixHeaders
  secret: string
}): { valid: boolean; reason?: string } {
  const { rawBody, headers, secret } = opts

  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { valid: false, reason: 'missing_headers' }
  }

  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts)) return { valid: false, reason: 'bad_timestamp' }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) {
    return { valid: false, reason: 'stale_timestamp' }
  }

  const keyBase64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  let keyBytes: Buffer
  try {
    keyBytes = Buffer.from(keyBase64, 'base64')
  } catch {
    return { valid: false, reason: 'bad_secret_encoding' }
  }

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`
  const expected = createHmac('sha256', keyBytes).update(signedContent).digest()

  for (const part of headers.signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    let candidate: Buffer
    try {
      candidate = Buffer.from(value, 'base64')
    } catch {
      continue
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { valid: true }
    }
  }

  return { valid: false, reason: 'no_match' }
}

/**
 * Извлекает оригинального отправителя из forward-цепочки.
 * Используется для inbox@<slug>.clientcase.app: сотрудник пересылает
 * клиентское письмо, нам нужен реальный From клиента.
 *
 * Стратегия:
 * 1. Reply-To, если он не равен From и не указывает на наш inbox.
 * 2. Парсинг forwarded-блока в text/plain (Gmail-style: `From: Name <addr>`).
 * 3. Fallback на outer From.
 */
export type ParsedAddress = { address: string; name?: string }

export function extractOriginalFrom(opts: {
  outerFrom: ParsedAddress | null
  replyTo: ParsedAddress | null
  textBody: string | null
  inboxAddress: string | null
}): ParsedAddress | null {
  const { outerFrom, replyTo, textBody, inboxAddress } = opts

  const inboxLower = inboxAddress?.toLowerCase() ?? null
  if (replyTo?.address) {
    const replyAddr = replyTo.address.toLowerCase()
    const outerAddr = outerFrom?.address.toLowerCase()
    if (replyAddr !== outerAddr && replyAddr !== inboxLower) {
      return replyTo
    }
  }

  if (textBody) {
    // Gmail forward: `---------- Forwarded message ---------` затем `From: ...`
    const fromLine = textBody.match(/^From:\s*(.+)$/m)
    if (fromLine) {
      const parsed = parseAddressLine(fromLine[1])
      if (parsed) return parsed
    }
  }

  return outerFrom
}

/**
 * Срезает Gmail-style цитату исходного письма из HTML-ответа.
 * Перенесено из supabase/functions/gmail-webhook/index.ts.
 */
export function stripHtmlQuotes(html: string): string {
  let result = html
  // Снимаем обёртки html/head/body КАК ТЕГИ (не «всё до <body>»). Письмо
  // бывает multipart — несколько склеенных <html>-документов; жадный
  // `^[\s\S]*<body>` матчился до ПОСЛЕДНЕГО <body> и выбрасывал ранние
  // части с основным текстом, оставляя только последнюю (обычно цитату).
  result = result.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
  result = result.replace(/<\/?(?:html|body)[^>]*>/gi, '')
  // <style> блоки (на случай inline <style> в теле)
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  // Gmail quote-контейнеры (div с классом gmail_quote)
  result = result.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/i, '')
  // Любые <blockquote>
  result = result.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '')
  // Trailing <br>
  result = result.replace(/(<br\s*\/?\s*>)+$/gi, '')
  // Tracking-пиксели 1×1
  result = result.replace(/<img[^>]*(?:width=["']1["']|height=["']1["'])[^>]*>/gi, '')
  // Пустые завершающие div/p/br
  result = result.replace(/(<div[^>]*>\s*<\/div>\s*|<p[^>]*>\s*<\/p>\s*|<br\s*\/?>)+$/gi, '')
  return result.trim() || html.trim()
}

/**
 * Срезает email-цитату из plain text body.
 * Перенесено из supabase/functions/gmail-webhook/index.ts.
 */
export function stripEmailQuotes(text: string): string {
  let result = text
  const patterns = [
    /\s*On\s+.{10,80}wrote:\s*/,
    /\s*(?:пн|вт|ср|чт|пт|сб|вс)[,.\s].{10,80}(?:<[^>]+>|@).{0,20}:\s*/,
    /\s*\d{1,2}[\s./-]\S{2,10}[\s./-]\d{4}\s*.{0,20}(?:в|at)\s+\d{1,2}:\d{2}.{0,50}(?:<[^>]+>|@).{0,20}:\s*/,
    /\n-- \n/,
  ]
  for (const p of patterns) {
    const m = result.match(p)
    if (m && m.index !== undefined && m.index > 0) {
      result = result.substring(0, m.index)
      break
    }
  }
  const lines = result.split('\n')
  while (lines.length > 0 && /^\s*>/.test(lines[lines.length - 1])) lines.pop()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n').trim() || text.trim()
}

function parseAddressLine(line: string): ParsedAddress | null {
  const angle = line.match(/<\s*([^>\s]+@[^>\s]+)\s*>/)
  if (angle) {
    const name = line.slice(0, angle.index).replace(/^["']|["']$/g, '').trim()
    return { address: angle[1].trim(), name: name || undefined }
  }
  const bare = line.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)
  if (bare) return { address: bare[1].trim() }
  return null
}
