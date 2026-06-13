import { NextResponse } from 'next/server'
import { extractOriginalFrom } from '@/lib/resendWebhook'
import { fetchResendInbound } from './api'
import {
  normalizeAddressList,
  normalizeHeaders,
  parseAddress,
  pickContent,
  pickPlatformRecipient,
} from './parsing'
import {
  applyVirtualRouting,
  createNewThreadInProject,
  ensurePersonalEmailThread,
  saveUnmatched,
} from './routing'
import {
  buildEmailMetadata,
  saveInboundAttachments,
  maybeSendAutoReply,
} from './inboundProcessing'
import { ROOT_DOMAIN, type ResendEmailData, type ResendEvent, type Resolution, type ServiceClient } from './types'

export async function handleInbound(supabase: ServiceClient, event: ResendEvent) {
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

  // email_metadata JSONB для UI (EmailFullViewDialog показывает «Открыть письмо»
  // при наличии body_html).
  const emailMetadata = buildEmailMetadata({
    messageIdHeader,
    resendId,
    inReplyTo,
    realFrom,
    toList,
    ccList,
    data,
  })

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
    // Вставка письма упала. Раньше тут был тихий 500 без логов → письмо
    // терялось, а только что созданный тред оставался пустым призраком
    // («Нет сообщений»). Теперь — fail-safe, чтобы пользователь точно узнал,
    // что письмо пришло, и мог открыть его в Gmail.
    console.error('[resend-webhook] insert_failed:', {
      detail: insertError.message,
      thread_id: threadId,
      project_id: projectId,
      from: realFrom.address,
      subject: data.subject ?? null,
      message_id: messageIdHeader,
      resend_id: resendId,
    })
    // (1) Гарантированная запись в «Несопоставленные» — простой insert в
    //     другую таблицу, переживает любую причину сбоя основной вставки.
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
      reason: `insert_failed:${insertError.message}`.slice(0, 500),
      spamScore: data.spam_score ?? null,
    }).catch((e) => console.error('[resend-webhook] saveUnmatched after insert_failed failed:', e))
    // (2) Заглушка-бабл прямо в тред — чтобы он не остался пустым и был виден
    //     в инбоксе. source='bot_event' в skip-листе dispatch_message_to_channels
    //     → НИЧЕГО не отправится наружу (ни email, ни TG). Минимальный payload
    //     (без email_message_id / metadata) — чтобы не наткнуться на ту же
    //     причину, что уронила основную вставку. Контент bot_event рендерится
    //     как ПРОСТОЙ ТЕКСТ — без HTML-тегов.
    const subjLabel = data.subject?.trim() || '(без темы)'
    const fromLabel = realFrom.name ?? realFrom.address
    await supabase
      .from('project_messages')
      .insert({
        thread_id: threadId,
        project_id: projectId,
        workspace_id: workspaceId,
        source: 'bot_event',
        sender_name: 'Система',
        sender_role: 'Email',
        content: `⚠️ Письмо «${subjLabel}» от ${fromLabel} получено, но не загрузилось в чат. Откройте его в Gmail.`,
      })
      .then(({ error }) => {
        if (error) console.error('[resend-webhook] placeholder insert failed:', error.message)
      })
    // 200, а не 500: письмо зафиксировано (unmatched + заглушка). На 500 Resend
    // ретраил бы и плодил дубли заглушек, а основная вставка всё равно падает.
    return NextResponse.json(
      { status: 'insert_failed_recovered', detail: insertError.message, thread_id: threadId },
      { status: 200 },
    )
  }

  // Обновляем «последний внешний адрес» треда — нужно для матчинга и для UI
  await supabase
    .from('project_threads')
    .update({ email_last_external_address: realFrom.address })
    .eq('id', threadId)

  // Вложения: скачиваем из Resend и кладём в Storage bucket 'files'.
  await saveInboundAttachments(supabase, {
    data,
    resendId,
    workspaceId,
    projectId,
    messageId: inserted.id,
  })

  // Auto-responder для virtual-адресов с включённым auto_reply (fire-and-forget).
  maybeSendAutoReply({
    resolution,
    data,
    recipientAddress: recipient.address,
    realFrom,
    messageIdHeader,
  })

  return NextResponse.json({
    status: 'ok',
    message_id: inserted!.id,
    resolution_type: resolution.resolution_type,
    thread_id: threadId,
  })
}
