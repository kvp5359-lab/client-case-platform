/**
 * Типы для работы с документами
 */

import { Tables } from '@/types/database'

// Типы из базы данных
export type Document = Tables<'documents'>
export type DocumentFile = Tables<'document_files'>
export type DocumentKit = Tables<'document_kits'>
export type Folder = Tables<'folders'>
export type DocumentStatus = Tables<'statuses'>
export type FolderSlot = Tables<'folder_slots'>

// Документ с файлами
export type DocumentWithFiles = {
  document_files?: DocumentFile[]
} & Document

// Набор документов с документами и папками
export type DocumentKitWithDocuments = {
  documents?: DocumentWithFiles[]
  folders?: Folder[]
} & DocumentKit

// Слот с подгруженным документом
export type FolderSlotWithDocument = {
  document?: DocumentWithFiles | null
} & FolderSlot

// Документ из источника (Google Drive)
export type SourceDocument = {
  id: string
  name: string
  mimeType: string
  size?: number
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  iconLink?: string
  parentFolderName?: string
  sourceDocumentId: string
  isHidden?: boolean
}

// Константы для таблицы документов
export const TABLE_COLUMN_WIDTHS = {
  nameColumn: '46%', // Колонка с названием и статусом
  sizeColumn: '7%', // Колонка с размером
  dateColumn: '7%', // Колонка с датой
  descColumn: '40%', // Колонка с описанием
} as const

// Позиция при drag & drop
export type DragOverPosition = 'top' | 'bottom'

// Системные секции
export type SystemSectionTab = 'unassigned' | 'source' | 'destination' | 'trash'

// Документ из папки назначения (Google Drive)
export type DestinationDocument = {
  id: string
  name: string
  mimeType: string
  size?: number
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  iconLink?: string
  parentFolderName?: string
}

// Props для строки в корзине
export type TrashedDocumentRowProps = {
  document: DocumentWithFiles
  index: number
  isSelected: boolean
  hasSelection: boolean
  isHovered: boolean
  onSelect: (docId: string, event?: React.MouseEvent) => void
  onHover: (docId: string | null) => void
  onOpenEdit: (docId: string) => void
  onRestore: (docId: string) => void
  onDelete: (docId: string) => void
}

// Props для строки источника
export type SourceDocumentRowProps = {
  file: SourceDocument
  isSelected: boolean
  hasSelection: boolean
  isDragging: boolean
  onSelect: (fileId: string, event?: React.MouseEvent) => void
  onToggleHidden: (fileId: string) => void
  onDownload: (file: SourceDocument) => void
  onMove: (file: SourceDocument) => void
  onDragStart: (e: React.DragEvent, file: SourceDocument) => void
  onDragEnd: () => void
}

// Информация о документе-источнике для привязки к слотам и загрузки
export type SourceDocumentInfo = {
  id: string
  name: string
  sourceDocumentId?: string
}

export function isStatusUnselected(status: string | null | undefined): boolean {
  if (status === null || status === undefined) return true
  if (typeof status === 'string') {
    return status.trim() === ''
  }
  return true
}
