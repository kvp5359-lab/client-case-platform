/**
 * Типы для вкладки «История» (лента аудит-событий + переписка)
 */

export type AuditLogEntry = {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown>
  created_at: string
  actor_user_id: string | null
  actor_email: string | null
  actor_name: string | null
}

export type HistoryFilters = {
  resourceTypes?: string[]
  actions?: string[]
  userId?: string
}
