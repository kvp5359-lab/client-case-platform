/**
 * Типы для ProjectPage.
 *
 * Project реэкспортируется из @/types/entities — раньше тут была локальная
 * копия, которая дрейфовала от канонического Tables<'projects'>.
 *
 * ProjectTemplateWithRelations — projection шаблона проекта с join-ами на
 * document_kits и forms. Используется в ProjectPage/ProjectPageDialogs для
 * получения списка id-шаблонов, которые уже привязаны к типу проекта.
 */

import type { Project } from '@/types/entities'

export type { Project }

export type ProjectTemplateWithRelations = {
  id: string
  name: string
  enabled_modules: string[] | null
  root_folder_id: string | null
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
