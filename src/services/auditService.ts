/**
 * Сервис аудит-логирования
 *
 * Используется для ручного логирования критических операций,
 * которые не покрываются триггерами БД (скачивание, экспорт и т.д.)
 *
 * Триггеры автоматически логируют:
 * - DELETE документов, проектов, наборов, папок
 * - INSERT/UPDATE/DELETE участников проекта
 *
 * Этот сервис нужен для:
 * - Скачивание файлов
 * - Экспорт на Google Drive
 * - Batch-операции из UI
 */

import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

type AuditAction =
  | 'download'
  | 'batch_download'
  | 'export_to_drive'
  | 'batch_delete'
  | 'batch_hard_delete'
  | 'soft_delete'
  | 'compress'
  | 'merge'
  | 'ai_check'
  // Thread/task actions
  | 'create'
  | 'delete'
  | 'rename'
  | 'change_status'
  | 'change_deadline'
  | 'change_settings'
  | 'pin'
  | 'unpin'
  | 'change_assignees'

type ResourceType = 'document' | 'document_kit' | 'folder' | 'project' | 'task' | 'form_kit' | 'thread'

/**
 * Записывает аудит-лог через RPC-функцию в БД.
 * Вызов fire-and-forget — не блокирует основную операцию.
 */
export async function logAuditAction(
  action: AuditAction,
  resourceType: ResourceType,
  resourceId?: string,
  details?: Record<string, unknown>,
  projectId?: string,
): Promise<void> {
  try {
    // Get current user_id explicitly — JWT claim may be empty in some contexts
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.rpc('log_audit_action', {
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId ?? undefined,
      p_details: (details ?? {}) as never,
      p_project_id: projectId ?? undefined,
      p_user_id: user?.id ?? undefined,
    } as never)
  } catch (error) {
    logger.error('Failed to write audit log:', error)
  }
}
