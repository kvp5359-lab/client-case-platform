import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import type { MessageChannel } from './messengerService'

/**
 * Mark messages as read (UPSERT) + reset manually_unread
 * PK: (participant_id, thread_id) — project_id optional for legacy compat
 */
export async function markAsRead(
  participantId: string,
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
): Promise<void> {
  if (!threadId) throw new ConversationError('threadId обязателен для markAsRead')
  const { error } = await supabase.from('message_read_status').upsert(
    {
      participant_id: participantId,
      ...(projectId ? { project_id: projectId } : {}),
      channel,
      thread_id: threadId,
      last_read_at: new Date().toISOString(),
      manually_unread: false,
    },
    { onConflict: 'participant_id,thread_id' },
  )

  if (error) throw new ConversationError(`Ошибка пометки прочитанного: ${error.message}`)
}

/**
 * Mark thread as unread — set manually_unread=true
 */
export async function markAsUnread(
  participantId: string,
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
): Promise<void> {
  if (!threadId) throw new ConversationError('threadId обязателен для markAsUnread')
  const { error } = await supabase.from('message_read_status').upsert(
    {
      participant_id: participantId,
      ...(projectId ? { project_id: projectId } : {}),
      channel,
      thread_id: threadId,
      last_read_at: new Date().toISOString(),
      manually_unread: true,
    },
    { onConflict: 'participant_id,thread_id' },
  )
  if (error) throw new ConversationError(`Ошибка пометки непрочитанного: ${error.message}`)
}

/**
 * Get last_read_at for participant (for unread divider)
 * Thread-first: if threadId provided, filter by it
 */
export async function getLastReadAt(
  participantId: string,
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
): Promise<string | null> {
  let query = supabase
    .from('message_read_status')
    .select('last_read_at')
    .eq('participant_id', participantId)

  if (threadId) {
    query = query.eq('thread_id', threadId)
  } else if (projectId) {
    query = query.eq('project_id', projectId).eq('channel', channel)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw new ConversationError(`Ошибка получения last_read_at: ${error.message}`)
  return data?.last_read_at ?? null
}

/**
 * Unread count via RPC
 */
export async function getUnreadCount(
  participantId: string,
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_messages_count', {
    p_participant_id: participantId,
    ...(projectId ? { p_project_id: projectId } : {}),
    p_channel: channel,
    ...(threadId ? { p_thread_id: threadId } : {}),
  })

  if (error) throw new ConversationError(`Ошибка подсчёта непрочитанных: ${error.message}`)

  return (data as number) ?? 0
}
