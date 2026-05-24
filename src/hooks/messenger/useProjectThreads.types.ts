import type { MessageChannel } from '@/services/api/messenger/messengerService'

export type ThreadAccentColor =
  | 'blue'
  | 'slate'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'orange'
  | 'cyan'
  | 'pink'
  | 'indigo'

export type ProjectThread = {
  id: string
  project_id: string | null
  workspace_id: string
  name: string
  type: 'chat' | 'task'
  access_type: 'all' | 'roles' | 'custom'
  access_roles: string[]
  legacy_channel: MessageChannel | null
  is_default: boolean
  sort_order: number
  accent_color: ThreadAccentColor
  icon: string
  description: string | null
  status_id: string | null
  deadline: string | null
  created_by: string | null
  is_deleted: boolean
  deleted_at: string | null
  deleted_by: string | null
  /** Публичный код для шаринга треда по ссылке (nullable — не у всех тредов включён). */
  link_code: string | null
  is_pinned: boolean
  /**
   * Thread template this thread was instantiated from, if any. Used by the
   * "+" menu to hide templates that already produced a thread in this
   * project, avoiding accidental duplicates.
   */
  source_template_id: string | null
  /** Привязка треда к Telegram Business connection. NULL — обычный тред. */
  business_connection_id: string | null
  /** TG-user_id клиента в business-чате (вместе с business_connection_id уникально определяет тред). */
  business_client_tg_user_id: number | null
  /** Привязка к каналу Wazzup. NULL — не Wazzup-тред. */
  wazzup_channel_id: string | null
  /** ID чата в Wazzup (телефон без `+` для WA, username для IG). */
  wazzup_chat_id: string | null
  /** Контакт-собеседник треда (для личных диалогов email/wazzup/telegram). NULL для проектных тредов и тредов между сотрудниками. */
  contact_participant_id: string | null
  created_at: string
  updated_at: string
}
