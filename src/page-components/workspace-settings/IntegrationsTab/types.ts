/**
 * Командные роли — те, кто работает в воркспейсе как сотрудник, а не как
 * клиент. Совпадает с TEAM_ROLES из мессенджера (MessageBubble.tsx).
 */
export const TEAM_ROLES = new Set(['Владелец', 'Администратор', 'Сотрудник', 'Внешний сотрудник'])

export interface BotIntegration {
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

export interface DialogState {
  title: string
  bot: BotIntegration | null
  createParams: {
    workspace_id: string
    type: 'telegram_workspace_bot' | 'telegram_employee_bot'
    config: BotIntegration['config']
  } | null
}

export interface EmailAccount {
  id: string
  email: string
  user_id: string | null
  is_active: boolean | null
  watch_expires_at: string | null
}

export type SectionKey = 'telegram' | 'gmail' | 'business' | 'wazzup' | 'email' | 'google_calendar'
