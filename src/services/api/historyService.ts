/**
 * Сервис для вкладки «История» — загрузка аудит-логов, отметка прочитанного
 */

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'
import type { AuditLogEntry, HistoryFilters } from '@/types/history'

/**
 * Загрузить ленту истории проекта с пагинацией
 */
export async function getProjectHistory(
  projectId: string,
  cursor?: string,
  limit = 30,
  filters?: HistoryFilters,
): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase.rpc('get_project_history', {
    p_project_id: projectId,
    p_cursor: cursor ?? null,
    p_limit: limit,
    p_resource_types: filters?.resourceTypes ?? null,
    p_actions: filters?.actions ?? null,
    p_user_id: filters?.userId ?? null,
  })

  if (error) throw new ApiError(`Ошибка загрузки истории: ${error.message}`)
  return (data ?? []) as AuditLogEntry[]
}

/**
 * Счётчик непрочитанных событий в истории проекта
 */
export async function getHistoryUnreadCount(projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_history_unread_count', {
    p_project_id: projectId,
  })

  if (error) throw new ApiError(`Ошибка счётчика непрочитанных: ${error.message}`)
  return (data as number) ?? 0
}

/**
 * Пометить историю проекта как прочитанную (UPSERT)
 */
export async function markHistoryAsRead(projectId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('history_read_status').upsert(
    {
      user_id: user.id,
      project_id: projectId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,project_id' },
  )

  if (error) throw new ApiError(`Ошибка отметки прочитанного: ${error.message}`)
}
