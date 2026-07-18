import type { MessageChannel } from '@/services/api/messenger/messengerService'
import type { AccentSlug } from '@/lib/accentPalette'

// Единый источник палитры — src/lib/accentPalette.ts (ACCENT_SLUGS/AccentSlug).
// Добавление цвета туда автоматически расширит этот тип → Record<ThreadAccentColor>-
// карты потребуют новый ключ (tsc). Не дублировать список слагов здесь вручную.
export type ThreadAccentColor = AccentSlug

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
  /** Привязка к сессии WAHA (WhatsApp self-hosted). NULL — не WAHA-тред. */
  waha_session_id?: string | null
  /** JID чата/группы в WAHA (…@c.us / …@g.us / …@lid). */
  waha_chat_id?: string | null
  /** Групповой WhatsApp-чат (через WAHA). */
  waha_group?: boolean | null
  /**
   * Владелец личного диалога (треды без project_id: TG Business / MTProto /
   * Wazzup / личная почта). Определяет, у кого диалог показывается и кому
   * приходят новые входящие. NULL для проектных тредов.
   */
  owner_user_id: string | null
  /** Контакт-собеседник треда (для личных диалогов email/wazzup/telegram). NULL для проектных тредов и тредов между сотрудниками. */
  contact_participant_id: string | null
  /** Тема email-треда (корень переписки). NULL для не-email. */
  email_subject_root?: string | null
  /** Последний внешний email-адрес собеседника. NULL для не-email. */
  email_last_external_address?: string | null
  created_at: string
  updated_at: string
}
