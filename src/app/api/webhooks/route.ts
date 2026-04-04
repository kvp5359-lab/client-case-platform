import { NextResponse } from 'next/server'

/**
 * Placeholder: API для внешних webhook'ов
 * Будет реализован для интеграций с внешними сервисами
 */

export async function POST() {
  return NextResponse.json(
    { status: 'not_implemented', message: 'External webhooks coming soon' },
    { status: 501 },
  )
}
