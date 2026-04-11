/**
 * Типы для ProjectPage.
 *
 * Project реэкспортируется из @/types/entities — раньше тут была локальная
 * копия, которая дрейфовала от канонического Tables<'projects'>.
 *
 * ProjectTemplateWithRelations — это projection тип для JOIN-запросов, где
 * шаблон приходит вместе со своими document_kits/forms связями. Он *не*
 * эквивалентен Database['public']['Tables']['project_templates']['Row'],
 * поэтому переименован, чтобы не клэшить с БД-типом.
 */

import type { Project } from '@/types/entities'

export type { Project }

export type ProjectTemplateWithRelations = {
  id: string
  name: string
  enabled_modules: string[]
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
