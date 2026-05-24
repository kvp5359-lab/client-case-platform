/**
 * Унифицированный тип события календарной сетки в BoardListCalendarView.
 * Может быть либо задачей (kind='task' — наша project_threads), либо
 * внешним событием из подключённого календаря (kind='external' —
 * Google и т.п. через external_calendar_events).
 * Для kind='external' resize/drag отключены (read-only).
 */

import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

export type CalEvent = {
  id: string
  title: string
  start: Date
  end: Date
  kind: 'task' | 'external'
  /** Для kind='task' — данные задачи. */
  resource?: WorkspaceTask & { start_at: string; end_at: string }
  /** Для kind='external' — мета внешнего события. */
  external?: {
    calendar_id: string
    external_id: string
    color: string
    html_link?: string | null
    location?: string | null
  }
}
