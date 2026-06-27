import type { RecurrenceFreq } from '@/lib/recurring/schedule'

/** Правило повторяющейся задачи (recurring_task_rules). */
export type RecurringRule = {
  id: string
  workspace_id: string
  project_id: string | null
  created_by: string | null
  owner_user_id: string | null
  title: string
  description: string | null
  accent_color: string
  icon: string
  status_id: string | null
  access_type: string
  access_roles: string[] | null
  assignee_participant_ids: string[]
  member_participant_ids: string[]
  initial_message_html: string | null
  source_template_id: string | null
  freq: RecurrenceFreq
  byweekday: number[]
  bymonthday: number | null
  fire_time: string
  end_time: string | null
  timezone: string
  create_lead_minutes: number
  starts_on: string | null
  until_date: string | null
  is_active: boolean
  occurrences_count: number
  next_occurrence_at: string | null
  last_run_at: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

/** Поля, которые задаёт пользователь при создании/правке правила. */
export type RecurringRuleInput = {
  workspace_id: string
  project_id?: string | null
  owner_user_id?: string | null
  title: string
  description?: string | null
  accent_color?: string
  icon?: string
  status_id?: string | null
  access_type?: string
  access_roles?: string[] | null
  assignee_participant_ids?: string[]
  member_participant_ids?: string[]
  source_template_id?: string | null
  freq: RecurrenceFreq
  byweekday?: number[]
  bymonthday?: number | null
  fire_time?: string
  end_time?: string | null
  timezone?: string
  create_lead_minutes?: number
  starts_on?: string | null
  until_date?: string | null
}
