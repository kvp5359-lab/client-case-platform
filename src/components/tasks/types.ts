/**
 * Общий интерфейс задачи для переиспользования между TasksTabContent и TasksPage.
 * Оба источника (ProjectThread из useProjectThreads, WorkspaceTask из RPC) приводятся к нему.
 */

export interface TaskItem {
  id: string
  name: string
  type: 'chat' | 'task'
  project_id: string | null
  workspace_id: string
  status_id: string | null
  deadline: string | null
  /** Запланированное начало (для слота в календаре). */
  start_at?: string | null
  /** Запланированный конец. */
  end_at?: string | null
  accent_color: string
  icon: string
  is_pinned: boolean
  created_at: string
  /** Постановщик (user_id) */
  created_by?: string | null
  /** Статус помечен «показывать постановщику» */
  status_show_to_creator?: boolean
  /** Название проекта — заполняется только на странице «Все задачи» */
  project_name?: string | null
  /** Порядок сортировки внутри группы */
  sort_order: number
  /** Email-связи (если это email-тред) */
  contact_emails?: string[]
  /** Тема письма */
  email_subject?: string | null
  /** Контакт собеседника — используется как scope боковой панели, если project_id=null. */
  contact_participant_id?: string | null
}
