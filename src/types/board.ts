/**
 * View-model DTO рабочего пространства: задачи/треды и проекты для досок,
 * списков и фильтр-движка.
 *
 * Нейтральный нижний слой: `services/api/boardFilterService` (и др.) зависят
 * сюда, не заходя в hooks/components (T1 аудита 2026-06-13). Хуки-источники
 * (`useWorkspaceThreads`, `useWorkspaceProjects`) реэкспортят отсюда.
 */

import type { Tables } from '@/types/database'

/** Тред (задача/чат) воркспейса — форма, которую отдаёт useWorkspaceThreads. */
export type WorkspaceTask = {
  id: string
  name: string
  type?: 'chat' | 'task'
  project_id: string | null
  project_name: string | null
  workspace_id: string
  status_id: string | null
  status_name: string | null
  status_color: string | null
  status_order: number | null
  status_show_to_creator: boolean
  deadline: string | null
  /** Запланированное начало (для слота в календаре). */
  start_at: string | null
  /** Запланированный конец. */
  end_at: string | null
  accent_color: string
  icon: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  sort_order: number
  /** Email-тред без отправленных писем = черновик (письмо ещё не ушло).
   *  Считается в RPC get_workspace_threads. true только для type='email'. */
  email_unsent?: boolean
}

/** Проект воркспейса с денормализованными полями для досок/фильтров. */
export type BoardProject = Tables<'projects'> & {
  template_name: string | null
  /** Есть ли у проекта хотя бы одна активная задача (не в финальном статусе) с дедлайном.
   *  Приходит из RPC get_accessible_projects. В прямом SELECT из таблицы projects (legacy-путь)
   *  не заполняется — используется только в фильтрах на доске проектов. */
  has_active_deadline_task?: boolean
  /** Шаблон проекта помечен как «лид» (project_templates.is_lead_template).
   *  Денормализуется в RPC. Используется фильтрами «только лиды». */
  is_lead_template?: boolean
  /** Подтип финального статуса проекта (won/lost/abandoned). NULL — если статус
   *  не финальный или final_kind не задан. Денормализуется из statuses в RPC. */
  final_kind?: 'won' | 'lost' | 'abandoned' | null
  /** Ближайшая активная задача с дедлайном — считается на сервере в
   *  get_board_filtered_projects. Используется для сортировки `next_task_deadline`
   *  и подписи «ближайшая задача» в строке проекта. Отсутствует в legacy-путях. */
  next_task_id?: string | null
  next_task_name?: string | null
  next_task_deadline?: string | null
}
