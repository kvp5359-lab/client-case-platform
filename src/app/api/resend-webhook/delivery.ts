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

  // Bounce / complaint / failed = «получатель не получил». Пишем в журнал
  // отказов, чтобы фронт получил sticky-toast через realtime — даже если
  // автор уже не на экране, он узнает что письмо не дошло.
  if (status === 'bounced' || status === 'complaint' || status === 'failed') {
    await logEmailDeliveryFailure(supabase, resendId, status, event)
  }

  return NextResponse.json({ status: 'ok', delivery_status: status })
}

async function logEmailDeliveryFailure(
  supabase: ServiceClient,
  resendId: string,
  status: 'bounced' | 'complaint' | 'failed',
  event: ResendEvent,
) {
  type MsgRow = {
    id: string
    project_id: string | null
    thread_id: string | null
    content: string | null
    sender_participant_id: string | null
    participant?: { user_id?: string | null } | null
    project?: { workspace_id?: string | null } | null
  }

  try {
    const { data } = await supabase
      .from('project_messages')
      .select(
        'id, project_id, thread_id, content, sender_participant_id, ' +
          'participant:participants!sender_participant_id ( user_id ), ' +
          'project:projects ( workspace_id )',
      )
      .eq('email_resend_id', resendId)
      .maybeSingle()
    const msg = data as unknown as MsgRow | null
    if (!msg) return
    const userId = msg.participant?.user_id ?? null
    const workspaceId = msg.project?.workspace_id ?? null
    if (!userId || !workspaceId) return

    // Дедуп — то же 5-минутное окно по project_message_id, что и в server-helper.
    const { data: existing } = await supabase
      .from('message_send_failures')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .filter('metadata->>project_message_id', 'eq', msg.id)
      .is('resolved_at', null)
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle()
    if (existing) return

    const reason =
      (event.data as Record<string, unknown> | undefined)?.['bounce']?.toString?.() ??
      (event.data as Record<string, unknown> | undefined)?.['reason']?.toString?.() ??
      `Resend: ${status}`

    await supabase.from('message_send_failures').insert({
      workspace_id: workspaceId,
      project_id: msg.project_id ?? null,
      thread_id: msg.thread_id ?? null,
      user_id: userId,
      participant_id: msg.sender_participant_id ?? null,
      content: msg.content ?? null,
      error_text: String(reason).slice(0, 2000),
      error_code: `resend_${status}`,
      source: 'email',
      metadata: { project_message_id: msg.id, resend_id: resendId, stage: 'resend_webhook' },
    })
  } catch (err) {
    console.warn('[resend-webhook] log email delivery failure:', err)
  }
}
