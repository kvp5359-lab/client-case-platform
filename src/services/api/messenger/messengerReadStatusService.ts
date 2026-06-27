import { supabase } from '@/lib/supabase'
import { ConversationError } from '@/services/errors/AppError'
import type { MessageChannel } from './messengerService.types'

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
 * Быстрый last_read_at по (workspace, user, thread) для красного контура.
 *
 * Раньше `useLastReadAt` брал это поле через RPC `get_inbox_thread_one` —
 * обёртку над `get_inbox_threads_v2`, которая ради ОДНОГО значения сканирует
 * весь инбокс (~750мс на проде). Контур из-за этого появлялся с паузой после
 * сообщений. Здесь — прямое чтение из `message_read_status` (~0.2мс).
 *
 * Участник резолвится так же, как `user_participant` в v2: единственная
 * workspace-запись юзера (`participants` по workspace_id+user_id). Значение
 * идентично тому, что отдавала RPC (в v2 last_read_at = просто
 * `message_read_status.last_read_at` для этого участника, без доп. формулы).
 */
export async function getThreadLastReadAtForUser(
  workspaceId: string,
  userId: string,
  threadId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('message_read_status')
    .select('last_read_at, participants!inner(user_id, workspace_id, is_deleted)')
    .eq('thread_id', threadId)
    .eq('participants.user_id', userId)
    .eq('participants.workspace_id', workspaceId)
    .eq('participants.is_deleted', false)
    .limit(1)
    .maybeSingle()

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
  // Автоген типов Supabase помечает p_project_id как non-null, но RPC
  // на стороне Postgres корректно обрабатывает NULL (для тредов без проекта).
  // Каст через never — единственный способ обойти автоген без отключения правил.
  const { data, error } = await supabase.rpc('get_unread_messages_count', {
    p_participant_id: participantId,
    ...(projectId ? { p_project_id: projectId } : {}),
    p_channel: channel,
    ...(threadId ? { p_thread_id: threadId } : {}),
  } as never)

  if (error) throw new ConversationError(`Ошибка подсчёта непрочитанных: ${error.message}`)

  return (data as number) ?? 0
}
