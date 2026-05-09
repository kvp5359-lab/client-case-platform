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
