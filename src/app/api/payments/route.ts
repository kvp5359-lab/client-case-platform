import { NextResponse } from 'next/server'

/**
 * Placeholder: API для платёжных webhook'ов
 * Будет реализован при подключении платёжной системы
 */

export async function POST() {
  return NextResponse.json(
    { status: 'not_implemented', message: 'Payment webhooks coming soon' },
    { status: 501 },
  )
}
