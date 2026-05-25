import { supabase } from '@/lib/supabase'
import { globalOpenThread } from './TaskPanelContext'

/**
 * Подгрузить тред из БД по id и открыть его в глобальной TaskPanel.
 *
 * Возвращает true если тред найден и открыт, false если не существует
 * (удалён или нет доступа). Используется кнопками «открыть исходный тред»
 * из мест, где известен только thread_id (поиск, ошибки отправки, бейджи
 * в сайдбаре).
 *
 * Карантинные потребители (SendFailureToasts, SendFailuresIndicator)
 * сознательно НЕ используют этот хелпер — там собственная копия логики
 * под особенности мессенджера.
 */
export async function openThreadById(threadId: string): Promise<boolean> {
  const { data: thread } = await supabase
    .from('project_threads')
    .select(
      'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
    )
    .eq('id', threadId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (!thread) return false
  globalOpenThread({
    id: thread.id,
    name: thread.name,
    type: thread.type as 'chat' | 'task',
    project_id: thread.project_id,
    workspace_id: thread.workspace_id,
    status_id: thread.status_id,
    deadline: thread.deadline,
    accent_color: thread.accent_color,
    icon: thread.icon,
    is_pinned: thread.is_pinned,
    created_at: thread.created_at,
    created_by: thread.created_by,
    sort_order: thread.sort_order ?? 0,
  })
  return true
}
