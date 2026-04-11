/**
 * Сервис для раздела "Входящие" — список тредов (v2: по тредам, не по проектам)
 */

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

/** @deprecated Используй InboxThreadEntry */
export interface InboxThread {
  project_id: string
  project_name: string
  project_status: string | null
  last_message_id: string | null
  last_message_at: string | null
  last_message_text: string | null
  last_sender_name: string | null
  unread_count: number
  manually_unread: boolean
  last_reaction_emoji: string | null
  last_reaction_at: string | null
  has_unread_reaction: boolean
  internal_unread_count: number
  internal_manually_unread: boolean
  client_thread_id: string | null
  internal_thread_id: string | null
  client_accent_color: string | null
  internal_accent_color: string | null
}

export type InboxChannelType = 'web' | 'telegram' | 'email'

export interface InboxThreadEntry {
  thread_id: string
  thread_name: string
  thread_icon: string
  thread_accent_color: string
  project_id: string
  project_name: string
  channel_type: InboxChannelType
  /** legacy_channel из project_threads: 'client' | 'internal' | null (для custom тредов) */
  legacy_channel: string | null
  last_message_at: string | null
  last_message_text: string | null
  last_sender_name: string | null
  last_sender_avatar_url: string | null
  unread_count: number
  manually_unread: boolean
  has_unread_reaction: boolean
  last_reaction_emoji: string | null
  /** Timestamp of the latest reaction on any message in this thread. */
  last_reaction_at: string | null
  /** Display name of the user who placed the latest reaction. */
  last_reaction_sender_name: string | null
  /** Avatar URL of the user who placed the latest reaction. */
  last_reaction_sender_avatar_url: string | null
  /** Raw HTML content of the message that was reacted to — needs stripping before display. */
  last_reaction_message_preview: string | null
  contact_email: string | null
  email_subject: string | null
  /** Audit: timestamp of last event (status change, rename, etc.) */
  last_event_at: string | null
  /** Audit: human-readable event description */
  last_event_text: string | null
  /** Audit: hex colour of the new status (only for change_status events) */
  last_event_status_color: string | null
  /** Audit: count of unread events */
  unread_event_count: number
}

/** @deprecated Используй getInboxThreadsV2 */
export async function getInboxThreads(workspaceId: string, userId: string): Promise<InboxThread[]> {
  const { data, error } = await supabase.rpc('get_inbox_threads', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

  if (error) throw new ApiError(`Ошибка загрузки входящих: ${error.message}`)
  return (data ?? []) as InboxThread[]
}

export async function getInboxThreadsV2(
  workspaceId: string,
  userId: string,
): Promise<InboxThreadEntry[]> {
  const { data, error } = await supabase.rpc('get_inbox_threads_v2', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  })

  if (error) throw new ApiError(`Ошибка загрузки входящих: ${error.message}`)
  return (data ?? []) as unknown as InboxThreadEntry[]
}
