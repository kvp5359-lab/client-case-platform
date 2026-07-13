/**
 * Командные workspace-роли для фильтра «кому можно дать персонального бота».
 * НЕ совпадает с глобальным STAFF_ROLES из permissions.ts: здесь намеренно
 * включён «Внешний сотрудник» (он работает на стороне сервиса, не клиент),
 * но исключён project-уровневый «Исполнитель».
 */
export const TEAM_ROLES = new Set([
  'Владелец',
  'Администратор',
  'Сотрудник',
  'Внешний сотрудник',
])

export type IntegrationBotType =
  | 'telegram_workspace_bot'
  | 'telegram_employee_bot'
  | 'telegram_lead_bot'

export type BotIntegration = {
  id: string
  type: IntegrationBotType
  is_active: boolean
  config: {
    bot_version?: string
    note?: string
    bot_username?: string
    bot_display_name?: string
    bot_id?: number
    owner_user_id?: string
    bot_avatar_url?: string
    // Лид-боты (telegram_lead_bot):
    /** Пул ответственных — попадают в участники диалога («все видят всё»). */
    responsible_user_ids?: string[]
    /** Приветствие при первом контакте клиента. */
    welcome_message?: string
    /** Базовая метка кампании (детализация — из deep-link ?start=). */
    base_campaign?: string
    /** Показывать имя отправителя клиенту (префикс «Имя:»). Несколько сотрудников на боте. */
    show_sender_name?: boolean
  }
  has_token: boolean
}

export type DialogState = {
  title: string
  bot: BotIntegration | null
  createParams: {
    workspace_id: string
    type: IntegrationBotType
    config: BotIntegration['config']
  } | null
}

export type EmailAccount = {
  id: string
  email: string
  user_id: string | null
  is_active: boolean | null
  watch_expires_at: string | null
}

export type SectionKey =
  | 'telegram'
  | 'lead_bots'
  | 'gmail'
  | 'business'
  | 'wazzup'
  | 'email'
  | 'google_calendar'
