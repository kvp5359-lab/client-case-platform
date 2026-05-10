import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-service'
import {
  extractOriginalFrom,
  getSvixHeaders,
  stripEmailQuotes,
  stripHtmlQuotes,
  verifySvixSignature,
  type ParsedAddress,
} from '@/lib/resendWebhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ROOT_DOMAIN = 'clientcase.app'

type ResendEvent = {
  type: string
  created_at?: string
  data: ResendEmailData
}

type ResendEmailData = {
  id?: string
  email_id?: string
  from?: string | { email: string; name?: string }
  to?: string[] | { email: string; name?: string }[]
  cc?: string[] | { email: string; name?: string }[]
  subject?: string
  text?: string
  html?: string
  /** Resend для inbound кладёт Message-ID как top-level поле, не только в headers. */
  message_id?: string
  in_reply_to?: string
  references?: string | string[]
  headers?: { name: string; value: string }[] | Record<string, string>
  attachments?: { filename?: string; content_type?: string; content?: string; size?: number }[]
  spam_score?: number
}

type Resolution = {
  workspace_id: string | null
  workspace_slug: string | null
  resolution_type: string
  thread_id: string | null
  project_id: string | null
  virtual_address_id: string | null
  routing_mode: string | null
  target_project_id: string | null
  target_thread_id: string | null
  default_thread_template_id: string | null
  default_assignee_user_id: string | null
  auto_reply_enabled: boolean | null
  auto_reply_text: string | null
  resolved_email_account_id: string | null
  resolved_user_id: string | null
}

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

async function handleInbound(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  event: ResendEvent,
) {
  // Resend в webhook payload передаёт только метаданные — без html/text body
  // и (часто) без headers. Поэтому достаём полный inbound через REST API
  // используя email_id из payload.
  const initialId = event.data.id ?? event.data.email_id ?? null
  let data: ResendEmailData = event.data
  if (initialId) {
    const fetched = await fetchResendInbound(initialId)
    if (fetched) data = { ...event.data, ...fetched }
  }
  const resendId = initialId

  const fromList = normalizeAddressList(data.from)
  const toList = normalizeAddressList(data.to)
  const ccList = normalizeAddressList(data.cc)

  const outerFrom = fromList[0] ?? null
  const headers = normalizeHeaders(data.headers)
  // Resend для inbound кладёт message_id / in_reply_to / references как top-level
  // поля на data; на всякий случай fallback в headers тех же имён.
  const messageIdHeader = data.message_id ?? headers['message-id'] ?? null
  const inReplyTo = data.in_reply_to ?? headers['in-reply-to'] ?? null
  const referencesRaw = data.references ?? headers['references'] ?? null
  const references: string[] = Array.isArray(referencesRaw)
    ? referencesRaw
    : typeof referencesRaw === 'string'
      ? referencesRaw.split(/\s+/).filter(Boolean)
      : []
  const replyTo = parseAddress(headers['reply-to'])

  const recipient = pickPlatformRecipient(toList, ccList)
  if (!recipient) {
    return NextResponse.json({ status: 'ignored', reason: 'no_platform_recipient' })
  }

  // Дедуп — если такой Message-ID уже сохранён, выходим тихо
  if (messageIdHeader) {
    const { data: existing } = await supabase
      .from('project_messages')
      .select('id')
      .eq('email_message_id', messageIdHeader)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ status: 'duplicate', message_id: existing.id })
    }
  }

  const { data: resolutionRows, error: resolutionError } = await supabase.rpc(
    'resolve_inbound_email_address',
    { p_address: recipient.address },
  )
  if (resolutionError) {
    return NextResponse.json({ error: 'resolve_failed', detail: resolutionError.message }, { status: 500 })
  }
  const resolution = (resolutionRows as Resolution[] | null)?.[0]
  if (!resolution || resolution.resolution_type === 'unknown_workspace') {
    return NextResponse.json({ status: 'ignored', reason: 'unknown_workspace', recipient: recipient.address })
  }

  const workspaceId = resolution.workspace_id
  if (!workspaceId) {
    return NextResponse.json({ status: 'ignored', reason: 'no_workspace_id' })
  }

  // Определяем «реального» отправителя (нужно для inbox-режима с forward'ом)
  const inboxAddress = `inbox@${resolution.workspace_slug}.${ROOT_DOMAIN}`
  const realFrom =
    resolution.resolution_type === 'inbox'
      ? extractOriginalFrom({
          outerFrom,
          replyTo,
          textBody: data.text ?? null,
          inboxAddress,
        }) ?? outerFrom
      : outerFrom

  if (!realFrom) {
    return NextResponse.json({ error: 'no_from_address' }, { status: 400 })
  }

  let threadId: string | null = null
  let projectId: string | null = null

  switch (resolution.resolution_type) {
    case 'thread': {
      threadId = resolution.thread_id
      projectId = resolution.project_id
      break
    }
    case 'project': {
      // Каждое письмо на p+<id>@ — НОВОЕ обращение → создаём новый тред,
      // даже если от того же отправителя уже есть треды в проекте.
      // Продолжение переписки клиент делает, отвечая на наше письмо
      // (Reply-To = t+<thread_id>@), которое уйдёт в resolution_type='thread'.
      const result = await createNewThreadInProject(supabase, {
        workspaceId,
        projectId: resolution.project_id!,
        fromAddress: realFrom.address,
        subject: data.subject ?? null,
      })
      threadId = result.threadId
      projectId = resolution.project_id
      break
    }
    case 'virtual': {
      const result = await applyVirtualRouting(supabase, {
        resolution,
        workspaceId,
        fromAddress: realFrom.address,
        subject: data.subject ?? null,
      })
      threadId = result.threadId
      projectId = result.projectId
      break
    }
    case 'inbox':
    case 'inbox_personal': {
      // Если это персональный inbox+<id>@ — у нас уже есть привязка к
      // email_account и user_id из RPC. Если общий inbox@ — пробуем
      // определить сотрудника по headers (Delivered-To / X-Forwarded-To /
      // Original-To) и ищем email_account с таким email.
      let assignedAccountId = resolution.resolved_email_account_id
      if (!assignedAccountId && resolution.resolution_type === 'inbox') {
        const candidateHeaderAddrs = [
          headers['delivered-to'],
          headers['x-forwarded-to'],
          headers['x-original-to'],
        ]
          .filter(Boolean)
          .map((v) => parseAddress(v ?? null)?.address?.toLowerCase())
          .filter((v): v is string => !!v)
        if (candidateHeaderAddrs.length) {
          const { data: accs } = await supabase
            .from('email_accounts')
            .select('id, email')
            .eq('workspace_id', workspaceId)
            .eq('is_active', true)
          const found = (accs as { id: string; email: string }[] | null)?.find((a) =>
            candidateHeaderAddrs.includes(a.email.toLowerCase()),
          )
          if (found) assignedAccountId = found.id
        }
      }

      // Стратегия матчинга:
      //  1. По In-Reply-To / References — это «настоящий» reply, нужно
      //     отдать в существующий тред в любом случае.
      //  2. Если не нашли и сотрудник определён — ищем тред среди
      //     ЕГО ЛИЧНЫХ тредов (email_send_account_id = его аккаунт)
      //     с тем же отправителем за последние 90 дней. Это покрывает
      //     случай "тот же клиент пишет новое письмо тебе".
      //  3. Если не нашли — создаём новый тред в его личном email-проекте.
      //
      // НЕ используем больше глобальный from+recent matcher — он
      // подтаскивал треды из других проектов другого сотрудника
      // и любых старых веток с тем же контактом.
      let matchedThread: { thread_id: string | null; project_id: string | null } | null = null
      if (inReplyTo || references.length) {
        const { data: matchRows } = await supabase.rpc('match_inbound_email', {
          p_workspace_id: workspaceId,
          p_from_address: realFrom.address,
          p_in_reply_to: inReplyTo,
          p_references: references,
        })
        const m = (matchRows as { thread_id: string | null; project_id: string | null; match_method: string }[] | null)?.[0]
        if (m && (m.match_method === 'in_reply_to' || m.match_method === 'references')) {
          matchedThread = { thread_id: m.thread_id, project_id: m.project_id }
        }
      }
      if (!matchedThread && assignedAccountId) {
        // Тот же отправитель → ищем тред с тем же email_subject_root,
        // чтобы не склеивать разные обращения одного клиента в один тред.
        const incomingSubject = (data.subject ?? '').replace(/^\s*(?:Re|Fwd?|Fw):\s*/i, '').trim()
        if (incomingSubject) {
          const { data: ownThread } = await supabase
            .from('project_threads')
            .select('id, project_id, email_subject_root')
            .eq('workspace_id', workspaceId)
            .eq('email_send_account_id', assignedAccountId)
            .eq('email_last_external_address', realFrom.address)
            .eq('is_deleted', false)
            .gte('updated_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
            .order('updated_at', { ascending: false })
            .limit(10)
          const found = (ownThread as { id: string; project_id: string | null; email_subject_root: string | null }[] | null)?.find(
            (t) =>
              (t.email_subject_root ?? '').replace(/^\s*(?:Re|Fwd?|Fw):\s*/i, '').trim().toLowerCase() ===
              incomingSubject.toLowerCase(),
          )
          if (found) matchedThread = { thread_id: found.id, project_id: found.project_id }
        }
      }

      if (matchedThread) {
        threadId = matchedThread.thread_id
        projectId = matchedThread.project_id
      } else if (assignedAccountId) {
        // Сотрудник определён, но треда с этим клиентом ещё нет — создаём
        // новый тред в его системном email-проекте «Мои email-треды».
        const newThread = await ensurePersonalEmailThread(supabase, {
          workspaceId,
          accountId: assignedAccountId,
          fromAddress: realFrom.address,
          subject: data.subject ?? null,
        })
        threadId = newThread.threadId
        projectId = newThread.projectId
      } else {
        await saveUnmatched(supabase, {
          workspaceId,
          resendId,
          fromAddress: realFrom.address,
          fromName: realFrom.name ?? null,
          toAddresses: toList.map((a) => a.address),
          ccAddresses: ccList.map((a) => a.address),
          subject: data.subject ?? null,
          messageIdHeader,
          inReplyTo,
          references,
          originalTo: recipient.address,
          reason: 'inbox_match_failed',
          spamScore: data.spam_score ?? null,
        })
        return NextResponse.json({ status: 'unmatched', reason: 'inbox_match_failed' })
      }
      break
    }
    case 'unknown_local':
    default: {
      await saveUnmatched(supabase, {
        workspaceId,
        resendId,
        fromAddress: realFrom.address,
        fromName: realFrom.name ?? null,
        toAddresses: toList.map((a) => a.address),
        ccAddresses: ccList.map((a) => a.address),
        subject: data.subject ?? null,
        messageIdHeader,
        inReplyTo,
        references,
        originalTo: recipient.address,
        reason: `unknown_local:${recipient.address}`,
        spamScore: data.spam_score ?? null,
      })
      return NextResponse.json({ status: 'unmatched', reason: 'unknown_local' })
    }
  }

  if (!threadId) {
    return NextResponse.json({ error: 'routing_returned_no_thread' }, { status: 500 })
  }

  // Готовим email_metadata JSONB для UI-компонентов (EmailFullViewDialog
  // показывает кнопку «Открыть письмо» при наличии email_metadata.body_html).
  const bodyHtmlRaw = data.html?.trim() || null
  const bodyTextRaw = data.text?.trim() || null
  const fullBodyHtml = bodyHtmlRaw
    ?? (bodyTextRaw ? `<pre style="white-space:pre-wrap">${escapeHtml(bodyTextRaw)}</pre>` : null)
  const emailMetadata = {
    gmail_message_id: messageIdHeader ?? resendId ?? '',
    message_id_header: messageIdHeader,
    in_reply_to: inReplyTo,
    from_email: realFrom.address,
    to_emails: toList.map((a) => a.address),
    cc_emails: ccList.map((a) => a.address),
    subject: data.subject ?? null,
    body_html: fullBodyHtml,
    attachments: null,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('project_messages')
    .insert({
      thread_id: threadId,
      project_id: projectId,
      workspace_id: workspaceId,
      source: 'email_internal',
      content: pickContent(data),
      sender_name: realFrom.name ?? realFrom.address,
      sender_role: 'Email',
      has_attachments: (data.attachments?.length ?? 0) > 0,
      email_message_id: messageIdHeader,
      email_in_reply_to: inReplyTo,
      email_references: references.length ? references : null,
      email_subject: data.subject ?? null,
      email_resend_id: resendId,
      email_metadata: emailMetadata,
    })
    .select('id')
    .single()
  if (insertError) {
    return NextResponse.json({ error: 'insert_failed', detail: insertError.message }, { status: 500 })
  }

  // Обновляем «последний внешний адрес» треда — нужно для матчинга и для UI
  await supabase
    .from('project_threads')
    .update({ email_last_external_address: realFrom.address })
    .eq('id', threadId)

  // Auto-responder: если письмо пришло на виртуальный адрес с включённым
  // auto_reply_enabled — fire-and-forget шлём готовый ответ.
  // Заголовок Auto-Submitted предотвращает ping-pong с другими auto-responder'ами.
  if (
    resolution.resolution_type === 'virtual' &&
    resolution.auto_reply_enabled &&
    resolution.auto_reply_text
  ) {
    sendAutoReply({
      to: realFrom.address,
      subject: data.subject?.trim() ? `Re: ${data.subject}` : 'Автоответ',
      text: resolution.auto_reply_text,
      fromLocal: recipient.address.split('@')[0] ?? 'noreply',
      fromDomain: recipient.address.split('@')[1] ?? `${resolution.workspace_slug}.${ROOT_DOMAIN}`,
      inReplyTo: messageIdHeader,
    }).catch((e) => {
      console.error('[resend-webhook] auto_reply failed:', e)
    })
  }

  return NextResponse.json({
    status: 'ok',
    message_id: inserted!.id,
    resolution_type: resolution.resolution_type,
    thread_id: threadId,
  })
}

async function sendAutoReply(opts: {
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

/**
 * Создаёт новый тред «Личные email-диалоги» сотрудника без проекта
 * (`project_id = NULL`, `owner_user_id = userId`). Используется
 * для inbox+<localpart>@: каждый клиент = новый тред.
 */
async function ensurePersonalEmailThread(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  opts: {
    workspaceId: string
    accountId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string; projectId: string | null }> {
  const { data: account } = await supabase
    .from('email_accounts')
    .select('user_id')
    .eq('id', opts.accountId)
    .maybeSingle()
  if (!account) throw new Error('email account not found')
  const userId = (account as { user_id: string }).user_id

  const { data: created, error } = await supabase
    .from('project_threads')
    .insert({
      project_id: null,
      owner_user_id: userId,
      workspace_id: opts.workspaceId,
      name: opts.subject?.trim() || `Email от ${opts.fromAddress}`,
      type: 'email',
      icon: 'mail',
      accent_color: 'rose',
      email_subject_root: opts.subject ?? null,
      email_last_external_address: opts.fromAddress,
      email_send_account_id: opts.accountId,
      email_send_method: 'employee_mailbox',
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !created) throw error ?? new Error('create personal email thread failed')
  return { threadId: created.id, projectId: null }
}

async function handleDeliveryStatus(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  event: ResendEvent,
) {
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

/**
 * Создаёт новый тред в проекте — без поиска существующего. Используется
 * для p+<id>@: каждое письмо клиента на адрес проекта = новое обращение.
 */
async function createNewThreadInProject(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  opts: {
    workspaceId: string
    projectId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string }> {
  // Считаем sort_order чтобы новый тред оказался в конце списка проекта
  // (как делает useProjectThreads при ручном создании). Без этого default=0
  // и треды толкаются в начало вперемешку.
  const { data: maxRow } = await supabase
    .from('project_threads')
    .select('sort_order')
    .eq('project_id', opts.projectId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = ((maxRow as { sort_order: number | null } | null)?.sort_order ?? 0) + 10

  const { data: created, error } = await supabase
    .from('project_threads')
    .insert({
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      name: opts.subject?.trim() || `Email от ${opts.fromAddress}`,
      type: 'email',
      icon: 'mail',
      accent_color: 'rose',
      sort_order: nextSortOrder,
      email_subject_root: opts.subject ?? null,
      email_last_external_address: opts.fromAddress,
    })
    .select('id')
    .single()
  if (error || !created) throw error ?? new Error('create_thread_failed')
  return { threadId: created.id }
}

/**
 * Ищет существующий тред в проекте по from-адресу, иначе создаёт новый.
 * Используется виртуальными адресами с routing_mode='append_existing'.
 */
async function ensureThreadInProject(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  opts: {
    workspaceId: string
    projectId: string
    fromAddress: string
    subject: string | null
    templateId: string | null
  },
): Promise<{ threadId: string }> {
  const { data: existing } = await supabase
    .from('project_threads')
    .select('id')
    .eq('project_id', opts.projectId)
    .eq('email_last_external_address', opts.fromAddress)
    .eq('is_deleted', false)
    .maybeSingle()
  if (existing) return { threadId: existing.id }
  return createNewThreadInProject(supabase, opts)
}

async function applyVirtualRouting(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  opts: {
    resolution: Resolution
    workspaceId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string | null; projectId: string | null }> {
  const { resolution, workspaceId } = opts
  if (resolution.routing_mode === 'fixed_thread' && resolution.target_thread_id) {
    const { data: thread } = await supabase
      .from('project_threads')
      .select('id, project_id')
      .eq('id', resolution.target_thread_id)
      .maybeSingle()
    if (thread) return { threadId: thread.id, projectId: thread.project_id }
  }

  const targetProjectId = resolution.target_project_id ?? null
  if (!targetProjectId) {
    return { threadId: null, projectId: null }
  }

  if (resolution.routing_mode === 'append_existing') {
    const { data: existing } = await supabase
      .from('project_threads')
      .select('id')
      .eq('project_id', targetProjectId)
      .eq('email_last_external_address', opts.fromAddress)
      .eq('is_deleted', false)
      .maybeSingle()
    if (existing) return { threadId: existing.id, projectId: targetProjectId }
  }

  const result = await ensureThreadInProject(supabase, {
    workspaceId,
    projectId: targetProjectId,
    fromAddress: opts.fromAddress,
    subject: opts.subject,
    templateId: resolution.default_thread_template_id ?? null,
  })
  return { threadId: result.threadId, projectId: targetProjectId }
}

async function saveUnmatched(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  opts: {
    workspaceId: string
    resendId: string | null
    fromAddress: string
    fromName: string | null
    toAddresses: string[]
    ccAddresses: string[]
    subject: string | null
    messageIdHeader: string | null
    inReplyTo: string | null
    references: string[]
    originalTo: string
    reason: string
    spamScore: number | null
  },
) {
  await supabase.from('email_inbound_unmatched').insert({
    workspace_id: opts.workspaceId,
    raw_mime_path: opts.resendId ? `resend:${opts.resendId}` : 'resend:unknown',
    resend_id: opts.resendId,
    from_address: opts.fromAddress,
    from_name: opts.fromName,
    to_addresses: opts.toAddresses,
    cc_addresses: opts.ccAddresses.length ? opts.ccAddresses : null,
    subject: opts.subject,
    message_id_header: opts.messageIdHeader,
    in_reply_to: opts.inReplyTo,
    references_headers: opts.references.length ? opts.references : null,
    original_to: opts.originalTo,
    reason: opts.reason,
    spam_score: opts.spamScore,
  })
}

/**
 * Подбираем содержимое для project_messages.content. CHECK constraint
 * требует длину > 0, поэтому при отсутствии html/text от Resend кладём
 * subject либо плейсхолдер.
 */
/**
 * Resend webhook payload содержит только метаданные. Полные данные
 * (html/text body, headers, attachments) — отдельным GET-запросом.
 */
async function fetchResendInbound(emailId: string): Promise<ResendEmailData | null> {
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

function pickContent(data: ResendEmailData): string {
  const html = data.html?.trim()
  if (html) return stripHtmlQuotes(html)
  const text = data.text?.trim()
  if (text) {
    const cleaned = stripEmailQuotes(text)
    // Простейшее plain → html: сохраняем переносы строк
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function pickPlatformRecipient(
  toList: ParsedAddress[],
  ccList: ParsedAddress[],
): ParsedAddress | null {
  const all = [...toList, ...ccList]
  return all.find((a) => isPlatformAddress(a.address)) ?? all[0] ?? null
}

function isPlatformAddress(address: string): boolean {
  return address.toLowerCase().endsWith('.' + ROOT_DOMAIN)
}

function normalizeAddressList(
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

function parseAddress(input: string | null | undefined): ParsedAddress | null {
  if (!input) return null
  const angle = input.match(/^\s*(?:"?([^"<]+?)"?\s*)?<\s*([^>\s]+@[^>\s]+)\s*>\s*$/)
  if (angle) {
    return { address: angle[2].trim(), name: angle[1]?.trim() || undefined }
  }
  const bare = input.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)
  if (bare) return { address: bare[1].trim() }
  return null
}

function normalizeHeaders(
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
