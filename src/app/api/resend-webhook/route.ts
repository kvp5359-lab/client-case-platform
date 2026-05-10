import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'
import { getSvixHeaders, verifySvixSignature } from '@/lib/resendWebhook'
import { handleInbound } from './inbound'
import { handleDeliveryStatus } from './delivery'
import type { ResendEvent } from './types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Resend webhook dispatcher. Тонкий слой: проверяет подпись Svix,
 * парсит JSON и роутит по типу события в `./inbound` / `./delivery`.
 * Бизнес-логика, утилиты парсинга и роутинг тредов вынесены в
 * соседние модули (parsing.ts, routing.ts, inbound.ts, delivery.ts).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'webhook_secret_not_configured' }, { status: 500 })
  }

  const rawBody = await req.text()
  const verification = verifySvixSignature({
    rawBody,
    headers: getSvixHeaders(req.headers),
    secret,
  })
  if (!verification.valid) {
    return NextResponse.json({ error: 'invalid_signature', reason: verification.reason }, { status: 401 })
  }

  let event: ResendEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  switch (event.type) {
    case 'email.received':
    case 'inbound.received':
      return handleInbound(supabase, event)
    case 'email.sent':
    case 'email.delivered':
    case 'email.bounced':
    case 'email.complained':
    case 'email.opened':
    case 'email.clicked':
    case 'email.delivery_delayed':
    case 'email.failed':
      return handleDeliveryStatus(supabase, event)
    default:
      return NextResponse.json({ status: 'ignored', type: event.type })
  }
}
