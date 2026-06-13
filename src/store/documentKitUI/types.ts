/**
 * Общие типы для DocumentKit UI Store
 */

import type { Tables } from '@/types/database'
import type {
  SourceDocument,
  DestinationDocument,
  SystemSectionTab,
} from '@/types/documents'

// Re-export для удобства
export type Document = Tables<'documents'>
export type Folder = Tables<'folders'>
export type FolderTemplate = Tables<'folder_templates'>

// Re-export from documents/types (canonical source)
export type { SystemSectionTab }
export type ExportPhase = 'idle' | 'cleaning' | 'uploading' | 'completed'

// Прогресс выгрузки документа в Google Drive. Форма данных (не UI), поэтому
// каноническое место — здесь (store-домен documentKit). Раньше определялось
// в ExportProgressDialog.tsx → store/services инвертированно зависели от диалога
// (T1 аудита 2026-06-13). Диалог теперь импортит отсюда.
export type ExportDocumentStatus = 'pending' | 'uploading' | 'success' | 'error'
export type ExportDocument = {
  documentId: string
  fileName: string
  folderName?: string
  status: ExportDocumentStatus
  progress?: number
  error?: string
}
export type SyncMode = 'replace_all' | 'add_only' | 'replace_existing'

// Progress type
export type Progress = {
  current: number
  total: number
}

// Folder form data
export type FolderFormData = {
  name: string
  description: string
  aiNamingPrompt?: string
  aiCheckPrompt?: string
  knowledgeArticleId: string | null
}

// Merge document
export type MergeDoc = {
  id: string
  name: string
  size: number
  order: number
}

// Re-export external types
export type { SourceDocument, DestinationDocument }
