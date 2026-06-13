"use client"

// Хук useWorkspaceProjects (полная выборка projects воркспейса) удалён после
// перехода досок на серверную фильтрацию (get_board_filtered_projects, 2026-06-11)
// — чтобы никто случайно не вернул full-table-запрос. Остался только тип
// BoardProject (его импортируют 8 файлов досок).

import type { Tables } from '@/types/database'

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
