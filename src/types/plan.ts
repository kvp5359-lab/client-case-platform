/**
 * Типы модуля «План» (project_plan_blocks / project_template_plan_blocks).
 *
 * Заданы вручную (а не из database.ts), чтобы код модуля компилировался
 * до регенерации сгенерированных типов. После применения миграции
 * 20260530_plan_module.sql и `supabase gen types` поля совпадут со схемой.
 *
 * См. docs/feature-backlog/2026-05-30-plan-module.md
 */

export type PlanBlockType = 'text' | 'heading' | 'task' | 'slot'

/** Строка project_plan_blocks (живой план в проекте). */
export type PlanBlockRow = {
  id: string
  workspace_id: string
  project_id: string
  block_type: PlanBlockType
  sort_order: number
  visible_to_client: boolean
  /** HTML-контент (Tiptap) — только для block_type='text' */
  content: string | null
  /** Ссылка на задачу (project_threads) — только для block_type='task' */
  thread_id: string | null
  /** Ссылка на слот документа (folder_slots) — только для block_type='slot' */
  folder_slot_id: string | null
  /** Группа, в которой лежит блок (project_task_groups.id). NULL = верхний уровень. */
  group_id: string | null
  created_at: string
  updated_at: string
}

export type PlanBlockUpdate = {
  sort_order?: number
  visible_to_client?: boolean
  content?: string | null
  group_id?: string | null
}

/** Строка project_template_plan_blocks («рыба» плана в шаблоне). */
export type TemplatePlanBlockRow = {
  id: string
  workspace_id: string
  project_template_id: string
  block_type: PlanBlockType
  sort_order: number
  visible_to_client: boolean
  content: string | null
  thread_template_id: string | null
  slot_template_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Блок плана, обогащённый живыми данными связанной сущности.
 * task → подмешан тред (имя, статус, дедлайн); slot → подмешан слот.
 */
export type EnrichedPlanBlock = PlanBlockRow & {
  task?: {
    id: string
    name: string
    status_id: string | null
    deadline: string | null
    icon: string | null
    accent_color: string | null
  } | null
  slot?: {
    id: string
    name: string
    deadline: string | null
    status: string | null
    has_document: boolean
  } | null
}
