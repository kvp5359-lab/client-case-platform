"use client"

/**
 * Хук для создания мемоизированных handlers для DocumentKitContext
 *
 * Рефакторинг: разделён на 3 подхука по ответственности:
 * - useDocumentHandlers — операции с документами
 * - useDragDropHandlers — drag & drop
 * - useFolderAndUIHandlers — папки, UI state, source/destination
 */

import { useMemo } from 'react'
import type { DocumentKitHandlers } from '../context/DocumentKitContext'
import type { DocumentWithFiles, SourceDocument, Folder } from '@/components/documents/types'
import { useDocumentHandlers } from './useDocumentHandlers'
import { useDragDropHandlers } from './useDragDropHandlers'
import { useFolderAndUIHandlers } from './useFolderAndUIHandlers'

// ============== Типы параметров ==============

interface UseDocumentKitContextHandlersParams {
  // Handlers из useDocumentKitHandlers
  handlers: {
    handleOpenEditDialog: (documentId: string) => void
    handleUpdateStatus: (documentId: string, newStatus: string | null) => Promise<void>
    handleCompressSingleDocument: (documentId: string) => void
    handleBatchCheck: () => void
    handleOpenMergeDialog: () => void
    handleBatchCompress: () => void
    handleBatchMove: (targetFolderId: string | null) => Promise<void>
    handleBatchDelete: () => void
    handleBatchHardDelete: () => void
    handleBatchDownload: () => void
    handleBatchExportToDisk: () => void
    handleExportToGoogleDrive: () => void
    handleFolderDrop: (e: React.DragEvent, targetFolderId: string | null) => Promise<void>
    handleDocDrop: (e: React.DragEvent, targetDoc: DocumentWithFiles) => Promise<void>
  }

  // Операции с документами
  documentOps: {
    handleOpen: (documentId: string) => void
    handleDownload: (documentId: string) => Promise<void>
    handleSoftDelete: (documentId: string) => Promise<void>
    handleRestore: (documentId: string) => Promise<void>
    handleHardDelete: (documentId: string) => Promise<void>
  }

  // Source операции
  sourceOps: {
    toggleSourceDocumentHidden: (fileId: string, isHidden: boolean) => Promise<void>
    handleToggleFolderHidden: (folderName: string, hide: boolean) => Promise<void>
    handleDownloadSourceDocument: (file: SourceDocument) => Promise<void>
    handleSyncSource: () => Promise<void>
  }

  // Destination операции
  destinationOps: {
    handleFetchDestination: () => Promise<void>
    handleOpenDestinationInDrive: () => void
  }

  // UI actions
  openMoveDialog: (docId: string) => void
  openSourceMoveDialog: (file: SourceDocument) => void
  openSourceSettingsDialog: () => void
  openDestinationSettingsDialog: () => void
  setHoveredDocument: (docId: string | null) => void
  toggleDocumentSelection: (
    docId: string,
    documents: DocumentWithFiles[],
    event?: React.MouseEvent,
  ) => void
  // Collapsed states setters
  setSystemSectionTab: (tab: 'unassigned' | 'destination' | 'trash') => void
  setUnassignedCollapsed: (collapsed: boolean) => void
  setSourceCollapsed: (collapsed: boolean) => void
  setDestinationCollapsed: (collapsed: boolean) => void
  setTrashCollapsed: (collapsed: boolean) => void
  toggleShowHiddenSourceDocs: () => void

  // Folder operations
  folderOps: {
    toggleFolder: (folderId: string) => void
    handleEditFolder: (folder: Folder) => void
    handleDeleteFolder: (folderId: string) => void
    handleFolderDocumentsClick: (folderId: string) => void
  }
  setHoveredFolder: (folderId: string | null) => void

  // Drag & Drop
  setDraggedDoc: (docId: string | null) => void
  setDragOverDoc: (data: { docId: string | null; position: 'above' | 'below' | null }) => void
  setDragOverFolder: (folderId: string | null) => void
  setDraggedSourceDoc: (file: SourceDocument | File | null) => void
  resetDragState: () => void

  // Slot operations
  slotHandlers: {
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

  // Данные для inline handlers
  projectId: string
  fetchDocumentKits: (projectId: string) => Promise<void>
  systemSectionTab: 'unassigned' | 'source' | 'destination' | 'trash'
  sourceDocuments: SourceDocument[]
  trashedDocuments: DocumentWithFiles[]
  ungroupedDocuments: DocumentWithFiles[]
  orderedDocumentList: DocumentWithFiles[]
}

// ============== Хук ==============

export function useDocumentKitContextHandlers(
  params: UseDocumentKitContextHandlersParams,
): DocumentKitHandlers {
  const documentHandlers = useDocumentHandlers({
    handlers: params.handlers,
    documentOps: params.documentOps,
    openMoveDialog: params.openMoveDialog,
    setHoveredDocument: params.setHoveredDocument,
    toggleDocumentSelection: params.toggleDocumentSelection,
    systemSectionTab: params.systemSectionTab,
    sourceDocuments: params.sourceDocuments,
    trashedDocuments: params.trashedDocuments,
    ungroupedDocuments: params.ungroupedDocuments,
    orderedDocumentList: params.orderedDocumentList,
  })

  const dragDropHandlers = useDragDropHandlers({
    handlers: params.handlers,
    setDraggedDoc: params.setDraggedDoc,
    setDragOverDoc: params.setDragOverDoc,
    setDragOverFolder: params.setDragOverFolder,
    setDraggedSourceDoc: params.setDraggedSourceDoc,
    resetDragState: params.resetDragState,
  })

  const folderAndUIHandlers = useFolderAndUIHandlers({
    handlers: params.handlers,
    sourceOps: params.sourceOps,
    destinationOps: params.destinationOps,
    folderOps: params.folderOps,
    openSourceMoveDialog: params.openSourceMoveDialog,
    openSourceSettingsDialog: params.openSourceSettingsDialog,
    openDestinationSettingsDialog: params.openDestinationSettingsDialog,
    setHoveredFolder: params.setHoveredFolder,
    setSystemSectionTab: params.setSystemSectionTab,
    setUnassignedCollapsed: params.setUnassignedCollapsed,
    setSourceCollapsed: params.setSourceCollapsed,
    setDestinationCollapsed: params.setDestinationCollapsed,
    setTrashCollapsed: params.setTrashCollapsed,
    toggleShowHiddenSourceDocs: params.toggleShowHiddenSourceDocs,
    projectId: params.projectId,
    fetchDocumentKits: params.fetchDocumentKits,
    sourceDocuments: params.sourceDocuments,
  })

  return useMemo(
    () => ({
      ...documentHandlers,
      ...dragDropHandlers,
      ...folderAndUIHandlers,
      ...params.slotHandlers,
    }),
    [documentHandlers, dragDropHandlers, folderAndUIHandlers, params.slotHandlers],
  )
}
