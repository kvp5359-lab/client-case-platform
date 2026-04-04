/**
 * Типы для ProjectPage
 */

import { Tables } from '@/types/database'

export type Project = Tables<'projects'>
export type ProjectTemplate = {
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
