/**
 * Сервис страницы «Личные диалоги».
 *
 * Возвращает треды, у которых `owner_user_id = target_user_id`. На время Этапа 1
 * такие треды могут лежать в фейковых системных проектах (Telegram/Wazzup/Email
 * inbox). После Этапа 4 они переедут в `project_id = NULL`. RPC `get_personal_dialogs`
 * работает в обоих режимах.
 */

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'

export type PersonalDialogChannel =
  | 'telegram_business'
  | 'telegram_mtproto'
  | 'wazzup'
  | 'email'
  | 'other'

export interface PersonalDialogEntry {
  thread_id: string
  thread_name: string
  thread_icon: string
  thread_accent_color: string
  /** 'task' | 'chat' | 'email' — тип треда. */
  thread_type: string
  /** `null` после Этапа 4. Сейчас — id фейкового системного проекта. */
  project_id: string | null
  project_name: string | null
  channel: PersonalDialogChannel
  legacy_channel: string | null
  last_message_at: string | null
  last_message_text: string | null
  last_message_attachment_name: string | null
  last_message_attachment_count: number
  last_sender_name: string | null
  last_sender_avatar_url: string | null
  unread_count: number
  manually_unread: boolean
  email_contact: string | null
  email_subject: string | null
  owner_user_id: string
}

export async function getPersonalDialogs(
  workspaceId: string,
  targetUserId: string,
): Promise<PersonalDialogEntry[]> {
  const { data, error } = await supabase.rpc('get_personal_dialogs', {
    p_workspace_id: workspaceId,
    p_target_user_id: targetUserId,
  })

  if (error) throw new ApiError(`Ошибка загрузки личных диалогов: ${error.message}`)
  return (data ?? []) as unknown as PersonalDialogEntry[]
}
