import type { TaskItem } from './types'

/** Маппинг ProjectThread (из БД) → TaskItem (для TaskPanel и openThreadTab). */
export function threadToTaskItem(
  thread: {
    id: string
    name: string
    type: 'task' | 'chat'
    project_id: string | null
    workspace_id: string
    status_id: string | null
    deadline: string | null
    accent_color: string
    icon: string
    is_pinned: boolean
    created_at: string
    sort_order: number | null
  },
): TaskItem {
  return {
    id: thread.id,
    name: thread.name,
    type: thread.type,
    project_id: thread.project_id,
    workspace_id: thread.workspace_id,
    status_id: thread.status_id,
    deadline: thread.deadline,
    accent_color: thread.accent_color,
    icon: thread.icon,
    is_pinned: thread.is_pinned,
    created_at: thread.created_at,
    sort_order: thread.sort_order ?? 0,
  }
}
