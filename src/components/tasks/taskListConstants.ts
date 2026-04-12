/**
 * Константы, вспомогательные типы и функции для TaskListView.
 * Сюда вынесены: метки групп, порядок, цвета, функция groupTasks, конвертеры.
 */

import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import { getDeadlineGroup, type DeadlineGroup } from '@/utils/deadlineUtils'
import type { TaskItem } from './types'

// ── Группировка по срокам ──

export const GROUP_LABELS: Record<DeadlineGroup, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  this_week: 'На этой неделе',
  later: 'Позже',
  no_deadline: 'Без срока',
}

export const GROUP_ORDER: DeadlineGroup[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later',
  'no_deadline',
]

export const GROUP_COLORS: Record<DeadlineGroup, string> = {
  overdue: 'text-red-600',
  today: 'text-blue-600',
  tomorrow: 'text-amber-600',
  this_week: 'text-emerald-600',
  later: 'text-muted-foreground',
  no_deadline: 'text-muted-foreground/60',
}

export const PRESET_LABELS: Record<string, string> = {
  my_active: 'Мои активные',
  active: 'Активные',
  control: 'Контроль',
  all: 'Все задачи',
}

// ── Функция группировки ──

export function groupTasks(tasks: TaskItem[]): Map<DeadlineGroup, TaskItem[]> {
  const groups = new Map<DeadlineGroup, TaskItem[]>()
  for (const task of tasks) {
    const group = getDeadlineGroup(task.deadline)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(task)
  }
  return groups
}

// ── Конвертеры ──

export function workspaceTaskToItem(t: WorkspaceTask): TaskItem {
  return {
    id: t.id,
    name: t.name,
    type: (t.type as 'chat' | 'task') ?? 'task',
    project_id: t.project_id,
    workspace_id: t.workspace_id,
    status_id: t.status_id,
    deadline: t.deadline,
    accent_color: t.accent_color,
    icon: t.icon,
    is_pinned: t.is_pinned,
    created_at: t.created_at,
    created_by: t.created_by,
    status_show_to_creator: t.status_show_to_creator,
    project_name: t.project_name,
    sort_order: t.sort_order ?? 0,
  }
}

export function threadToItem(t: ProjectThread): TaskItem {
  return {
    id: t.id,
    name: t.name,
    type: t.type as 'chat' | 'task',
    project_id: t.project_id,
    workspace_id: t.workspace_id,
    status_id: t.status_id,
    deadline: t.deadline,
    accent_color: t.accent_color,
    icon: t.icon,
    is_pinned: t.is_pinned,
    created_at: t.created_at,
    created_by: t.created_by,
    sort_order: t.sort_order ?? 0,
  }
}

/** Конвертация свежесозданного треда + результата ChatSettingsDialog → TaskItem */
export function newThreadToTaskItem(thread: ProjectThread, result?: ChatSettingsResult): TaskItem {
  return {
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
    sort_order: thread.sort_order,
    contact_emails:
      result?.channelType === 'email' && result?.contactEmails?.length
        ? result.contactEmails.map((e) => e.email)
        : undefined,
    email_subject: result?.emailSubject ?? null,
  }
}
