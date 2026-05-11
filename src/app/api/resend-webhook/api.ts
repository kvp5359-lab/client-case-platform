import type { ResendEmailData } from './types'

/**
 * Resend webhook payload содержит только метаданные. Полные данные
 * (html/text body, headers, attachments) — отдельным GET-запросом.
 */
export async function fetchResendInbound(emailId: string): Promise<ResendEmailData | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`https://api.resend.com/emails/inbound/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as ResendEmailData
    return data
  } catch {
    return null
  }
}

/**
 * Список вложений со подписанными download_url. Resend в webhook payload
 * и в /emails/inbound/{id} отдаёт только метаданные attachments
 * (filename/size/content_type) — без контента. За контентом нужно ходить
 * сюда: эндпоинт возвращает download_url (signed CloudFront URL).
 */
export async function fetchResendInboundAttachments(
  emailId: string,
): Promise<
  Array<{
    id: string
    filename: string
    size: number
    content_type: string
    download_url: string
  }>
> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}/attachments?limit=100`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    if (!res.ok) return []
    const json = (await res.json()) as {
      data?: Array<{
        id: string
        filename: string
        size: number
        content_type: string
        download_url: string
      }>
    }
    return json.data ?? []
  } catch {
    return []
  }
}

export async function sendAutoReply(opts: {
  to: string
  subject: string
  text: string
  fromLocal: string
  fromDomain: string
  inReplyTo: string | null
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const headers: Record<string, string> = {
    'Auto-Submitted': 'auto-replied',
    'X-Auto-Response-Suppress': 'All',
    Precedence: 'auto_reply',
  }
  if (opts.inReplyTo) headers['In-Reply-To'] = opts.inReplyTo
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${opts.fromLocal}@${opts.fromDomain}`,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      headers,
    }),
  })
}
