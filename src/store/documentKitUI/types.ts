/**
 * Общие типы для DocumentKit UI Store
 */

import type { Tables } from '@/types/database'
import type {
  SourceDocument,
  DestinationDocument,
  SystemSectionTab,
} from '@/components/documents/types'
import type { ExportDocument } from '@/components/projects/DocumentKitsTab/dialogs/ExportProgressDialog'

// Re-export для удобства
export type Document = Tables<'documents'>
export type Folder = Tables<'folders'>
export type FolderTemplate = Tables<'folder_templates'>

// Re-export from documents/types (canonical source)
export type { SystemSectionTab }
export type ExportPhase = 'idle' | 'cleaning' | 'uploading' | 'completed'
export type SyncMode = 'replace_all' | 'add_only' | 'replace_existing'

// Progress type
export interface Progress {
  current: number
  total: number
}

// Folder form data
export interface FolderFormData {
  name: string
  description: string
  aiNamingPrompt?: string
  aiCheckPrompt?: string
  knowledgeArticleId: string | null
}

// Merge document
export interface MergeDoc {
  id: string
  name: string
  size: number
  order: number
}

// Re-export external types
export type { SourceDocument, DestinationDocument, ExportDocument }
