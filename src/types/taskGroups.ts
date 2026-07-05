/**
 * Типы «Групп задач» (project_task_groups / project_template_task_groups).
 *
 * Заданы вручную (как src/types/plan.ts), чтобы код компилировался до
 * регенерации database.ts. Группа = раздел плана, внутри которого по порядку
 * лежат задачи, тексты и слоты (у них поле group_id / task_group_id).
 */

/** Строка project_task_groups (группа в проекте). */
export type TaskGroupRow = {
  id: string
  workspace_id: string
  project_id: string
  name: string
  accent_color: string | null
  sort_order: number
  is_collapsed: boolean
  visible_to_client: boolean
  created_at: string
  updated_at: string
}

export type TaskGroupUpdate = {
  name?: string
  accent_color?: string | null
  sort_order?: number
  is_collapsed?: boolean
  visible_to_client?: boolean
}

/** Строка project_template_task_groups (группа в шаблоне проекта). */
export type TemplateTaskGroupRow = {
  id: string
  workspace_id: string
  project_template_id: string
  name: string
  accent_color: string | null
  sort_order: number
  visible_to_client: boolean
  created_at: string
  updated_at: string
}
