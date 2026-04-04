/**
 * Типы для шаблонов тредов (thread_templates + thread_template_assignees)
 */

import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

export interface ThreadTemplateAssignee {
  participant_id: string
}

export interface ThreadTemplate {
  id: string
  workspace_id: string
  name: string
  description: string | null
  thread_type: 'chat' | 'task'
  is_email: boolean
  thread_name_template: string | null
  accent_color: ThreadAccentColor
  icon: string
  access_type: 'all' | 'roles'
  access_roles: string[]
  default_status_id: string | null
  deadline_days: number | null
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
  assignee_ids: string[] // participant IDs
  default_contact_email: string
  email_subject_template: string
  initial_message_html: string
}
