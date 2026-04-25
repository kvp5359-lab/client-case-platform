/**
 * Типы для шаблонов тредов (thread_templates + thread_template_assignees)
 */


export interface ThreadTemplateAssignee {
  participant_id: string
}

export interface ThreadTemplate {
  id: string
  workspace_id: string
  /**
   * When set, the template belongs to a specific project template and is
   * only visible inside projects of that type. When null, the template is
   * global (shown in workspace settings and in every project's "+" menu).
   */
  owner_project_template_id: string | null
  name: string
  description: string | null
  thread_type: 'chat' | 'task'
  is_email: boolean
  thread_name_template: string | null
  accent_color: string
  icon: string
  access_type: 'all' | 'roles'
  access_roles: string[] | null
  default_status_id: string | null
  deadline_days: number | null
  /**
   * Если задача, созданная по этому шаблону, переходит в финальный статус —
   * проект автоматически переводится в этот статус (uuid из statuses).
   * NULL = автоперехода нет. Применяется только для thread_type='task'.
   * Применение делает БД-триггер `auto_advance_project_status`.
   */
  on_complete_set_project_status_id: string | null
  default_contact_email: string | null
  email_subject_template: string | null
  initial_message_html: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined from thread_template_assignees
  thread_template_assignees?: ThreadTemplateAssignee[]
}

export interface ThreadTemplateFormData {
  name: string
  description: string
  thread_type: 'chat' | 'task'
  is_email: boolean
  thread_name_template: string
  accent_color: string
  icon: string
  access_type: 'all' | 'roles'
  access_roles: string[]
  default_status_id: string | null
  deadline_days: number | null
  on_complete_set_project_status_id: string | null
  assignee_ids: string[] // participant IDs
  default_contact_email: string
  email_subject_template: string
  initial_message_html: string
}
