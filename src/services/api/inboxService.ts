/**
 * Сервис для раздела "Входящие" — список тредов (v2: по тредам, не по проектам).
 *
 * Версия v1 (`get_inbox_threads`, `InboxThread`) удалена из TS-кода в рамках
 * аудита 2026-04-11, П5.1 — все потребители переведены на v2. Сам RPC
 * `get_inbox_threads` пока остаётся в БД как legacy (см. Зону 2 аудита), но
 * клиентский код его не вызывает.
 */

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

export type InboxChannelType = 'web' | 'telegram' | 'email'

export interface InboxThreadEntry {
  thread_id: string
  thread_name: string
  thread_icon: string
  thread_accent_color: string
  /**
   * `null` для workspace-level тредов (не привязаны к проекту).
   * v2 RPC реально возвращает null для таких — project_threads_insert policy
   * разрешает их через workspace_id + access_type='custom'.
   */
  project_id: string | null
  /**
   * `null` синхронно с `project_id`: у workspace-level тредов нет проекта,
   * а значит и имени проекта. UI должен показывать fallback вроде
   * «Рабочая область» / имя воркспейса.
   */
  project_name: string | null
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
