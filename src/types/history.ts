/**
 * Типы для вкладки «История» (лента аудит-событий + переписка)
 */

export interface AuditLogEntry {
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

export interface HistoryFilters {
  resourceTypes?: string[]
  actions?: string[]
  userId?: string
}

/** Единый элемент timeline — либо аудит, либо сообщение */
export type TimelineEntry =
  | { kind: 'audit'; data: AuditLogEntry }
  | { kind: 'message'; data: TimelineMessage }

export interface TimelineMessage {
  id: string
  thread_id: string
  thread_name: string
  thread_accent: string
  thread_icon: string
  sender_name: string
  sender_user_id: string | null
  sender_avatar_url: string | null
  content: string
  source: 'web' | 'telegram' | 'email'
  created_at: string
  forwarded_from_name: string | null
  reply_to: { sender_name: string; content: string } | null
  attachments: { id: string; file_name: string; file_size: number; mime_type: string }[]
}

/** Набор включённых фильтров timeline */
export interface TimelineFilterState {
  /** Включённые типы ресурсов аудита (пустой set = все выключены) */
  auditResourceTypes: Set<string>
  /** Включённые thread IDs для переписки */
  threadIds: Set<string>
}
