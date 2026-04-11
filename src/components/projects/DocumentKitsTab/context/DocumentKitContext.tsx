"use client"

/**
 * Context API для DocumentKitsTab
 *
 * Разбит на 4 независимых контекста для оптимизации ререндеров:
 * - DataContext — данные (kit, folders, documents, statuses)
 * - UIStateContext — UI-состояние (selection, hover, drag, collapsed)
 * - HandlersContext — обработчики событий (стабильные через useCallback)
 * - IdsContext — projectId, workspaceId (почти не меняются)
 *
 * API потребителей не изменён: useDocumentKitData(), useDocumentKitUIState() и т.д.
 */

import { createContext, useContext, useMemo, ReactNode } from 'react'
import type {
  DocumentWithFiles,
  DocumentStatus,
  SourceDocument,
  DestinationDocument,
  FolderSlotWithDocument,
  DragOverPosition,
  Folder,
  DocumentKit,
} from '@/components/documents/types'

// ============== Типы данных ==============

export interface DocumentKitData {
  kit: DocumentKit | null | undefined
  folders: Folder[]
  statuses: DocumentStatus[]
  folderStatuses: DocumentStatus[]
  ungroupedDocuments: DocumentWithFiles[]
  sourceDocuments: SourceDocument[]
  destinationDocuments: DestinationDocument[]
  trashedDocuments: DocumentWithFiles[]
  folderSlots: FolderSlotWithDocument[]
}

export interface DocumentKitUIState {
  // Выделение
  selectedDocuments: Set<string>
  hasSelection: boolean

  // Hover
  hoveredDocumentId: string | null
  hoveredFolderId: string | null

  // Drag & Drop
  draggedDocId: string | null
  dragOverDocId: string | null
  dragOverPosition: DragOverPosition
  dragOverFolderId: string | null
  draggedSourceDoc: SourceDocument | null

  // Фильтры
  showOnlyUnverified: boolean

  // Collapsed states
  collapsedFolders: Set<string>
  unassignedCollapsed: boolean
  sourceCollapsed: boolean
  destinationCollapsed: boolean
  trashCollapsed: boolean

  // Активная вкладка SystemSection
  activeTab: 'unassigned' | 'source' | 'destination' | 'trash'

  // Загрузка/прогресс
  isUploading: boolean
  compressingDocIds: Set<string>
  isSyncing: boolean
  isExporting: boolean
  isFetchingDestination: boolean
  hasExported: boolean
  exportPhase: 'idle' | 'cleaning' | 'uploading' | 'completed'
  showHiddenSourceDocs: boolean

  // Слот в режиме редактирования имени (после создания)
  editingSlotId: string | null
}

export interface DocumentKitHandlers {
  // Document operations
  onSelectDocument: (docId: string, event?: React.MouseEvent) => void
  onHoverDocument: (docId: string | null) => void
  onOpenEditDocument: (docId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
  onMoveDocument: (docId: string) => void
  onDuplicateDocument?: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onRestoreDocument: (docId: string) => void
  onHardDeleteDocument: (docId: string) => void
  onStatusChange: (docId: string, statusId: string | null) => void
  // UI state changes
  onTabChange: (tab: 'unassigned' | 'source' | 'destination' | 'trash') => void
  onUnassignedCollapsedChange: (collapsed: boolean) => void
  onSourceCollapsedChange: (collapsed: boolean) => void
  onDestinationCollapsedChange: (collapsed: boolean) => void
  onTrashCollapsedChange: (collapsed: boolean) => void

  // Folder operations
  onToggleFolder: (folderId: string) => void
  onHoverFolder: (folderId: string | null) => void
  onEditFolder: (folder: Folder) => void
  onDeleteFolder: (folderId: string) => void
  onAddDocumentToFolder: (folderId: string) => void
  onFolderStatusChange: (folderId: string, statusId: string | null) => void

  // Source operations
  onToggleSourceDocHidden: (docId: string) => void
  onToggleFolderHidden: (folderName: string, hide: boolean) => void
  onDownloadSourceDocument: (file: SourceDocument) => void
  onMoveSourceDocument: (file: SourceDocument) => void
  onSyncSource: () => void
  onShowHiddenSourceDocsChange: () => void
  onOpenSourceSettings: () => void

  // Destination operations
  onExportToDestination: () => void
  onFetchDestination: () => void
  onOpenDestinationInDrive: () => void
  onOpenDestinationSettings: () => void

  // Drag & Drop
  onDocDragStart: (e: React.DragEvent, docId: string) => void
  onDocDragOver: (e: React.DragEvent, targetDocId: string) => void
  onDocDragLeave: () => void
  onDocDrop: (e: React.DragEvent, doc: DocumentWithFiles) => void
  onDocDragEnd: () => void
  onFolderDragOver: (e: React.DragEvent, folderId: string | null) => void
  onFolderDragLeave: () => void
  onFolderDrop: (e: React.DragEvent, folderId: string | null) => void
  onSourceDocDragStart: (e: React.DragEvent, file: SourceDocument) => void
  onSourceDocDragEnd: () => void

  // Slot operations
  onSlotClick: (slotId: string, folderId: string) => void
  onSlotUnlink: (slotId: string) => void
  onSlotDelete: (slotId: string) => void
  onDeleteEmptySlots: (folderId: string) => void
  onSlotRename: (slotId: string, name: string) => void
  onAddSlot: (folderId: string) => void
  onSlotDrop: (slotId: string, documentId: string) => void
  onSlotDropSourceDoc: (
    slotId: string,
    folderId: string,
    sourceDoc: { id: string; name: string; sourceDocumentId?: string },
  ) => void
  onClearEditingSlot: () => void
}

interface DocumentKitIds {
  projectId: string
  workspaceId: string
}

// ============== 4 контекста ==============

const DataContext = createContext<DocumentKitData | null>(null)
const UIStateContext = createContext<DocumentKitUIState | null>(null)
const HandlersContext = createContext<DocumentKitHandlers | null>(null)
const IdsContext = createContext<DocumentKitIds | null>(null)

// ============== Объединённый тип (для обратной совместимости) ==============

export interface DocumentKitContextValue {
  data: DocumentKitData
  uiState: DocumentKitUIState
  handlers: DocumentKitHandlers
  projectId: string
  workspaceId: string
}

// ============== Provider ==============

export interface DocumentKitProviderProps {
  children: ReactNode
  value: DocumentKitContextValue
}

export function DocumentKitProvider({ children, value }: DocumentKitProviderProps) {
  const ids = useMemo(
    () => ({ projectId: value.projectId, workspaceId: value.workspaceId }),
    [value.projectId, value.workspaceId],
  )

  return (
    <IdsContext.Provider value={ids}>
      <HandlersContext.Provider value={value.handlers}>
        <DataContext.Provider value={value.data}>
          <UIStateContext.Provider value={value.uiState}>{children}</UIStateContext.Provider>
        </DataContext.Provider>
      </HandlersContext.Provider>
    </IdsContext.Provider>
  )
}

// ============== Hooks (API сохранён) ==============

/**
 * Полный контекст — для обратной совместимости.
 * Ререндерится при любом изменении. Используй селекторы.
 */
export function useDocumentKitContext(): DocumentKitContextValue {
  const data = useDocumentKitData()
  const uiState = useDocumentKitUIState()
  const handlers = useDocumentKitHandlers()
  const { projectId, workspaceId } = useDocumentKitIds()
  return useMemo(
    () => ({ data, uiState, handlers, projectId, workspaceId }),
    [data, uiState, handlers, projectId, workspaceId],
  )
}

export function useDocumentKitData(): DocumentKitData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDocumentKitData must be used within DocumentKitProvider')
  return ctx
}

export function useDocumentKitUIState(): DocumentKitUIState {
  const ctx = useContext(UIStateContext)
  if (!ctx) throw new Error('useDocumentKitUIState must be used within DocumentKitProvider')
  return ctx
}

export function useDocumentKitHandlers(): DocumentKitHandlers {
  const ctx = useContext(HandlersContext)
  if (!ctx) throw new Error('useDocumentKitHandlers must be used within DocumentKitProvider')
  return ctx
}

export function useDocumentKitIds() {
  const ctx = useContext(IdsContext)
  if (!ctx) throw new Error('useDocumentKitIds must be used within DocumentKitProvider')
  return ctx
}
