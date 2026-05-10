import { NextResponse } from 'next/server'
import type { ResendEvent, ServiceClient } from './types'

export async function handleDeliveryStatus(supabase: ServiceClient, event: ResendEvent) {
  const resendId = event.data.id ?? event.data.email_id
  if (!resendId) {
    return NextResponse.json({ status: 'ignored', reason: 'no_id' })
  }

  const statusMap: Record<string, string> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complaint',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.delivery_delayed': 'queued',
    'email.failed': 'failed',
  }
  const status = statusMap[event.type]
  if (!status) {
    return NextResponse.json({ status: 'ignored', type: event.type })
  }

  const { error } = await supabase
    .from('project_messages')
    .update({ email_delivery_status: status })
    .eq('email_resend_id', resendId)
  if (error) {
    return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', delivery_status: status })
}
