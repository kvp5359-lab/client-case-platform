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

export type BotIntegration = {
  id: string
  type: 'telegram_workspace_bot' | 'telegram_employee_bot'
  is_active: boolean
  config: {
    bot_version?: string
    note?: string
    bot_username?: string
    bot_display_name?: string
    bot_id?: number
    owner_user_id?: string
    bot_avatar_url?: string
  }
  has_token: boolean
}

export type DialogState = {
  title: string
  bot: BotIntegration | null
  createParams: {
    workspace_id: string
    type: 'telegram_workspace_bot' | 'telegram_employee_bot'
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

export type SectionKey = 'telegram' | 'gmail' | 'business' | 'wazzup' | 'email' | 'google_calendar'
