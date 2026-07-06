/**
 * Utilities for parsing and grouping new message toast payloads.
 */
import { supabase } from '@/lib/supabase'
import { stripHtmlIgnoreQuotes } from '@/utils/format/messengerHtml'

// Реестр тостов вынесен в leaf-слой (`lib/messenger/toastRegistry`), чтобы его
// мог дёргать и сервис `markAsRead` без нарушения слоёв. Здесь — ре-экспорт для
// существующих импортёров (useNewMessageToast и др.).
export {
  groupedLines,
  makeGroupKey,
  dismissProjectToasts,
  dismissThreadToasts,
} from '@/lib/messenger/toastRegistry'
export type { GroupKey } from '@/lib/messenger/toastRegistry'

export type RealtimeMessagePayload = {
  project_id: string
  workspace_id: string
  sender_participant_id: string | null
  sender_name: string | null
  content: string
  channel: string | null
  thread_id: string | null
  /** ISO timestamp вставки в БД — нужен, чтобы отличать «настоящие новые»
   *  сообщения от исторических INSERT'ов (бэкфилл MTProto), которые
   *  Realtime тоже шлёт. */
  created_at?: string | null
}

/** Avatar URL cache by participant_id */
const MAX_AVATAR_CACHE = 200
const avatarCache = new Map<string, string | null>()

function truncateLine(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Load avatar_url from participants and cache it */
export async function fetchAvatarUrl(participantId: string): Promise<string | null> {
  if (avatarCache.has(participantId)) return avatarCache.get(participantId) ?? null
  const { data } = await supabase
    .from('participants')
    .select('avatar_url')
    .eq('id', participantId)
    .maybeSingle()
  const url = data?.avatar_url ?? null
  if (avatarCache.size >= MAX_AVATAR_CACHE) {
    const firstKey = avatarCache.keys().next().value
    if (firstKey !== undefined) avatarCache.delete(firstKey)
  }
  avatarCache.set(participantId, url)
  return url
}

/**
 * Parse message content into a display-ready text line.
 * Handles attachment-only messages by querying message_attachments.
 */
export async function parseTextLine(rawContent: string, messageId: string): Promise<string> {
  const text = stripHtmlIgnoreQuotes(rawContent)
  if (text !== '📎' && text.trim()) {
    return truncateLine(text)
  }

  // Attachment-only message — determine type
  const fetchAttachments = () =>
    supabase.from('message_attachments').select('mime_type, file_name').eq('message_id', messageId)

  let { data: attachments } = await fetchAttachments()
  if (!attachments?.length) {
    await new Promise((r) => setTimeout(r, 1500))
    ;({ data: attachments } = await fetchAttachments())
  }

  const att = attachments?.[0]
  // Несколько вложений — как во «Входящих»: «имя +N».
  const extra = (attachments?.length ?? 0) > 1 ? ` +${attachments!.length - 1}` : ''
  if (att?.mime_type?.startsWith('audio/') || att?.mime_type === 'video/ogg') {
    return `🎤 Голосовое сообщение${extra}`
  } else if (att?.mime_type?.startsWith('image/')) {
    return `📷 Фото${extra}`
  } else if (att?.mime_type?.startsWith('video/')) {
    return `🎥 Видео${extra}`
  } else if (att) {
    return `📎 ${att.file_name || 'Файл'}${extra}`
  }
  return '📎 Вложение'
}
