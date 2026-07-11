/**
 * Чистые/изолированные шаги обработки входящего письма, вынесены из
 * handleInbound (inbound.ts), чтобы основной обработчик остался читаемым.
 * Логика НЕ менялась — это механический вынос блоков без control-flow.
 */

import { fetchResendInboundAttachments, sendAutoReply } from './api'
import { escapeHtml } from './parsing'
import { ROOT_DOMAIN, type ResendEmailData, type Resolution, type ServiceClient } from './types'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'
import { serverUploadToStorage } from '@/lib/storage/serverR2'

type Address = { address: string; name?: string | null }

/** Собирает email_metadata JSONB для UI (EmailFullViewDialog и пр.). */
export function buildEmailMetadata(params: {
  messageIdHeader: string | null
  resendId: string | null
  inReplyTo: string | null
  realFrom: Address
  toList: Address[]
  ccList: Address[]
  data: ResendEmailData
}) {
  const { messageIdHeader, resendId, inReplyTo, realFrom, toList, ccList, data } = params
  const bodyHtmlRaw = data.html?.trim() || null
  const bodyTextRaw = data.text?.trim() || null
  const fullBodyHtml =
    bodyHtmlRaw ??
    (bodyTextRaw ? `<pre style="white-space:pre-wrap">${escapeHtml(bodyTextRaw)}</pre>` : null)
  const attachmentsForMetadata =
    data.attachments?.map((a) => ({
      filename: a.filename ?? null,
      content_type: a.content_type ?? null,
      size: a.size ?? null,
      has_inline_content: !!a.content,
      url: a.url ?? null,
    })) ?? null

  return {
    gmail_message_id: messageIdHeader ?? resendId ?? '',
    message_id_header: messageIdHeader,
    in_reply_to: inReplyTo,
    from_email: realFrom.address,
    to_emails: toList.map((a) => a.address),
    cc_emails: ccList.map((a) => a.address),
    subject: data.subject ?? null,
    body_html: fullBodyHtml,
    attachments: attachmentsForMetadata,
  }
}

/**
 * Скачивает вложения письма из Resend и кладёт в Storage bucket 'files',
 * привязывая к сообщению. Resend отдаёт только метаданные — за подписанным
 * download_url ходим отдельно.
 */
export async function saveInboundAttachments(
  supabase: ServiceClient,
  params: {
    data: ResendEmailData
    resendId: string | null
    workspaceId: string
    projectId: string | null
    messageId: string
  },
) {
  const { data, resendId, workspaceId, projectId, messageId } = params
  if (!(data.attachments && data.attachments.length > 0 && resendId)) return

  const remoteAttachments = await fetchResendInboundAttachments(resendId)
  // ВРЕМЕННАЯ диагностика (расследование потери email-вложений 2026-07-11).
  const dbg = async (filename: string, size: number, mime: string, step: string, detail: string) => {
    try {
      // временная таблица, не в database.ts — каст клиента на время диагностики
      const anyDb = supabase as unknown as {
        from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<unknown> }
      }
      await anyDb.from('_r2_inbound_debug').insert({ resend_id: resendId, filename, size, mime, step, detail })
    } catch { /* диагностика не должна ломать приём */ }
  }
  for (const att of remoteAttachments) {
    const mime0 = att.content_type || 'application/octet-stream'
    try {
      const r = await fetch(att.download_url)
      if (!r.ok) {
        console.warn('[resend-webhook] attachment download failed:', att.filename, r.status)
        await dbg(att.filename, att.size, mime0, 'download_fail', `HTTP ${r.status}`)
        continue
      }
      const buf = await r.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const fileName = att.filename ?? 'attachment'
      const dotIdx = fileName.lastIndexOf('.')
      const ext = dotIdx >= 0 ? fileName.slice(dotIdx) : ''
      const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      const sp = projectId
        ? `${workspaceId}/${projectId}/email-attachments/${rand}`
        : `${workspaceId}/email-attachments/${rand}`
      const mime = att.content_type || 'application/octet-stream'
      // Запись через серверный storage-слой: ветвится на R2 по флагу
      // NEXT_PUBLIC_STORAGE_R2_BUCKETS — тот же бэкенд, откуда фронт читает файл.
      // Прямой supabase.storage писал бы в Supabase, а фронт искал бы в R2 → 404.
      const { error: ue } = await serverUploadToStorage(
        supabase,
        STORAGE_BUCKETS.files,
        sp,
        bytes,
        { upsert: false, contentType: mime },
      )
      if (ue) {
        await dbg(fileName, bytes.length, mime, 'upload_fail', ue.message ?? 'unknown')
        continue
      }
      const { data: fr, error: fe } = await supabase
        .from('files')
        .insert({
          workspace_id: workspaceId,
          bucket: STORAGE_BUCKETS.files,
          storage_path: sp,
          file_name: fileName,
          file_size: bytes.length,
          mime_type: mime,
        })
        .select('id')
        .single()
      if (!fr) {
        await dbg(fileName, bytes.length, mime, 'files_insert_fail', fe?.message ?? 'no row')
        continue
      }
      await supabase.from('message_attachments').insert({
        message_id: messageId,
        file_name: fileName,
        file_size: bytes.length,
        mime_type: mime,
        storage_path: sp,
        file_id: fr.id,
      })
      await dbg(fileName, bytes.length, mime, 'ok', sp)
    } catch (e) {
      console.error('[resend-webhook] Attachment error:', att.filename, e)
      await dbg(att.filename, att.size, mime0, 'exception', String(e).slice(0, 400))
    }
  }
}

/**
 * Auto-responder для virtual-адресов с включённым auto_reply. Fire-and-forget.
 * Заголовок Auto-Submitted (внутри sendAutoReply) предотвращает ping-pong.
 */
export function maybeSendAutoReply(params: {
  resolution: Resolution
  data: ResendEmailData
  recipientAddress: string
  realFrom: Address
  messageIdHeader: string | null
}) {
  const { resolution, data, recipientAddress, realFrom, messageIdHeader } = params
  if (
    resolution.resolution_type === 'virtual' &&
    resolution.auto_reply_enabled &&
    resolution.auto_reply_text
  ) {
    sendAutoReply({
      to: realFrom.address,
      subject: data.subject?.trim() ? `Re: ${data.subject}` : 'Автоответ',
      text: resolution.auto_reply_text,
      fromLocal: recipientAddress.split('@')[0] ?? 'noreply',
      fromDomain: recipientAddress.split('@')[1] ?? `${resolution.workspace_slug}.${ROOT_DOMAIN}`,
      inReplyTo: messageIdHeader,
    }).catch((e) => {
      console.error('[resend-webhook] auto_reply failed:', e)
    })
  }
}
