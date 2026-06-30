/**
 * Доменные типы проекта (нейтральный слой).
 *
 * Вынесено из `page-components/ProjectPage/types` (T1/D1 аудита 2026-06-13),
 * чтобы `moduleRegistry` и project-хуки можно было опустить из page-private
 * слоя без инверсии. `ProjectPage/types` теперь реэкспортит отсюда.
 */

import type { Project } from '@/types/entities'

export type { Project }

/**
 * Projection шаблона проекта с join-ами на document_kits и forms. Используется
 * для получения списка id-шаблонов, уже привязанных к типу проекта.
 */
export type ProjectTemplateWithRelations = {
  id: string
  name: string
  default_name_prefix: string | null
  show_name_prefix_in_sidebar: boolean
  enabled_modules: string[] | null
  root_folder_id: string | null
  folder_name_template: string | null
  folder_name_replace_spaces: boolean
  file_size_warn_mb: number | null
  file_size_danger_mb: number | null
  project_template_document_kits: Array<{ document_kit_template_id: string }>
  project_template_forms: Array<{ form_template_id: string }>
}

export type ProjectTab =
  | 'settings'
  | 'forms'
  | 'documents'
  | 'finances'
  | 'tasks'
  | 'history'
  | 'participants'
