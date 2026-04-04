/**
 * Типы для сервисного слоя документов.
 *
 * Базовые типы (Document, DocumentFile, Folder, DocumentWithFiles, SourceDocument)
 * канонически определены в components/documents/types.ts — реэкспортируем оттуда.
 * Здесь — только типы параметров сервисных операций.
 */

// Реэкспорт базовых типов
export type {
  Document,
  DocumentFile,
  Folder,
  DocumentWithFiles,
  SourceDocument,
} from '@/components/documents/types'

// --- Параметры сервисных операций ---

export interface DocumentUploadParams {
  file: File
  kitId: string
  folderId?: string | null
  status?: string | null
  projectId: string
  workspaceId: string
}

export interface DocumentMoveParams {
  documentId: string
  folderId: string | null
}

export interface DocumentStatusUpdateParams {
  documentId: string
  status: string | null
}

export interface DocumentReorderParams {
  documentId: string
  newSortOrder: number
  folderId?: string | null
}

export interface MergeDocumentsParams {
  documentIds: string[]
  name: string
  folderId: string | null
  kitId: string
  projectId: string
  workspaceId: string
}
