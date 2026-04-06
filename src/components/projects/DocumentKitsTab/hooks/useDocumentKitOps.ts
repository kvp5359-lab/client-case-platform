"use client"

/**
 * useDocumentKitOps — инициализация всех операционных хуков для DocumentKitsTab.
 *
 * Извлечён из useDocumentKitSetup для снижения размера файла.
 * Логика не менялась — только перемещён блок вызовов хуков.
 */

import { useQueryClient } from '@tanstack/react-query'
import { useDocumentEdit } from './useDocumentEdit'
import { useDocumentVerify } from './useDocumentVerify'
import { useFolderOperations } from './useFolderOperations'
import { useDocumentMerge } from './useDocumentMerge'
import { useBatchOperations } from './useBatchOperations'
import { useDocumentCompress } from './useDocumentCompress'
import { useGoogleDriveExport } from './useGoogleDriveExport'
import { useDocumentOperations } from './useDocumentOperations'
import { useSourceDocumentUpload } from './useSourceDocumentUpload'
import { useBatchMoveOperations } from './useBatchMoveOperations'
import { useDocumentKitHandlers } from './useDocumentKitHandlers'
import { useSlotHandlers } from './useSlotHandlers'
import { useProjectSourceDocuments } from '@/hooks/documents/useProjectSourceDocuments'
import { useProjectSourceConnection } from '@/hooks/documents/useProjectSourceConnection'
import { useProjectDestinationFolder } from '@/hooks/documents/useProjectDestinationFolder'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import { projectKeys } from '@/hooks/queryKeys'
import type { DocumentKitWithDocuments } from '@/services/api/documents/documentKitService'
import type { DocumentWithFiles, Folder, SourceDocument, DestinationDocument } from '@/components/documents/types'
import type { ProjectPermissionCode } from '@/types/permissions'
import type { Tables } from '@/types/database'

interface UseDocumentKitOpsParams {
  projectId: string
  workspaceId: string
  sourceFolderId: string | null | undefined
  exportFolderId: string | null | undefined

  // Kit data
  kit: DocumentKitWithDocuments | undefined
  documentKits: DocumentKitWithDocuments[]
  folders: Folder[]

  // Document operations
  uploadDocument: (params: {
    file: File
    documentKitId: string
    projectId: string
    workspaceId: string
    documentName?: string
    documentDescription?: string
    folderId?: string | null
    sourceDocumentId?: string | null
  }) => Promise<{ document: Tables<'documents'>; fileId: string }>
  hardDeleteDocument: (documentId: string) => Promise<void>
  reorderDocuments: (
    updates: {
      id: string
      sort_order: number
      folder_id?: string | null
      document_kit_id?: string
    }[],
  ) => Promise<void>

  // Slot operations
  createSlot: (params: {
    folder_id: string
    project_id: string
    workspace_id: string
    name: string
  }) => Promise<{ id: string } | null>
  updateSlot: (params: { slotId: string; updates: { name: string } }) => Promise<void>
  deleteSlot: (slotId: string) => Promise<void>
  deleteEmptySlots: (folderId: string) => Promise<void>
  fillSlot: (params: { slotId: string; documentId: string }) => Promise<void>
  unlinkSlot: (slotId: string) => Promise<void>
  refetchSlots: () => Promise<unknown>

  // Callbacks
  fetchDocumentKits: (projectId: string) => Promise<void>
  getDocument: (documentId: string) => DocumentWithFiles | undefined
  requirePermission: (
    module: 'settings' | 'forms' | 'documents',
    permission: ProjectPermissionCode,
  ) => void
  clearSelection: () => void

  // Selection & drag state
  selectedDocuments: Set<string>
  draggedDocId: string | null
  dragOverPosition: 'top' | 'bottom' | null
  draggedSourceDoc: SourceDocument | null
  resetDragState: () => void

  // Store actions
  openBatchCheckDialog: (documentIds: string[]) => void
  showHiddenSourceDocs: boolean
  setSourceDocuments: (docs: SourceDocument[]) => void
  setSyncing: (value: boolean) => void
  setSystemSectionTab: (tab: 'unassigned' | 'source' | 'destination' | 'trash') => void
  setSourceCollapsed: (collapsed: boolean) => void
  setSourceFolderName: (name: string) => void
  setDestinationDocuments: (docs: DestinationDocument[]) => void
  setExportingToDestination: (value: boolean) => void
  setFetchingDestination: (value: boolean) => void
  setHasExported: (value: boolean) => void
  setExportFolderConnected: (value: boolean) => void
  deleteDocumentKit: (kitId: string) => Promise<void>
  setExportPhase: (phase: 'idle' | 'cleaning' | 'uploading' | 'completed') => void
  setExportDocuments: (docs: import('../dialogs/ExportProgressDialog').ExportDocument[]) => void
  updateExportDocumentStatus: (
    documentId: string,
    status: 'pending' | 'uploading' | 'success' | 'error',
    progress?: number,
    error?: string,
  ) => void
  setExportCleaningProgress: (progress: number) => void
  openExportProgressDialog: () => void
  closeExportProgressDialog: () => void
  sourceDocuments: SourceDocument[]
}

export function useDocumentKitOps({
  projectId,
  workspaceId,
  sourceFolderId,
  exportFolderId,
  kit,
  documentKits,
  folders,
  uploadDocument,
  hardDeleteDocument,
  reorderDocuments,
  createSlot,
  updateSlot,
  deleteSlot,
  deleteEmptySlots,
  fillSlot,
  unlinkSlot,
  refetchSlots,
  fetchDocumentKits,
  getDocument,
  requirePermission,
  clearSelection,
  selectedDocuments,
  draggedDocId,
  dragOverPosition,
  draggedSourceDoc,
  resetDragState,
  openBatchCheckDialog,
  showHiddenSourceDocs,
  setSourceDocuments,
  setSyncing,
  setSystemSectionTab,
  setSourceCollapsed,
  setSourceFolderName,
  setDestinationDocuments,
  setExportingToDestination,
  setFetchingDestination,
  setHasExported,
  setExportFolderConnected,
  deleteDocumentKit,
  setExportPhase,
  setExportDocuments,
  updateExportDocumentStatus,
  setExportCleaningProgress,
  openExportProgressDialog,
  closeExportProgressDialog,
  sourceDocuments,
}: UseDocumentKitOpsParams) {
  const queryClient = useQueryClient()

  const documentOps = useDocumentOperations({
    projectId,
    fetchDocumentKits,
    getDocument,
    requirePermission,
  })
  const documentEdit = useDocumentEdit(projectId, fetchDocumentKits)
  const documentVerify = useDocumentVerify(projectId, fetchDocumentKits)
  const folderOps = useFolderOperations(projectId, workspaceId, fetchDocumentKits)
  const documentMerge = useDocumentMerge(
    projectId,
    workspaceId,
    () => fetchDocumentKits(projectId),
    uploadDocument,
    documentOps.handleSoftDelete,
    clearSelection,
  )
  const batchOps = useBatchOperations({
    projectId,
    fetchDocumentKits,
    clearSelection,
    softDeleteDocument: documentOps.handleSoftDelete,
    hardDeleteDocument,
    openBatchCheckDialog,
    requirePermission,
  })
  const { addCompressingDoc, removeCompressingDoc, setCompressProgress } = useDocumentKitUIStore()
  const compressOps = useDocumentCompress({
    projectId,
    fetchDocumentKits,
    clearSelection,
    addCompressingDoc,
    removeCompressingDoc,
    setCompressProgress,
  })
  const exportOps = useGoogleDriveExport({
    workspaceId,
    clearSelection,
    setExportPhase,
    setExportDocuments,
    updateExportDocumentStatus,
    setExportCleaningProgress,
    openExportProgressDialog,
    closeExportProgressDialog,
  })
  const sourceOps = useProjectSourceDocuments({
    projectId,
    sourceFolderId: sourceFolderId ?? null,
    workspaceId,
    showHiddenSourceDocs,
    setSourceDocuments,
    setSyncing,
    setSystemSectionTab,
    setSourceCollapsed,
    setSourceFolderName,
  })
  const sourceUpload = useSourceDocumentUpload({
    kit,
    allKits: documentKits,
    projectId,
    workspaceId,
    fetchDocumentKits,
    loadSourceDocuments: sourceOps.loadSourceDocuments,
    hardDeleteDocument,
  })
  const batchMoveOps = useBatchMoveOperations({
    projectId,
    allKits: documentKits,
    fetchDocumentKits,
    clearSelection,
    reorderDocuments,
    uploadSourceDocument: sourceUpload.uploadSourceDocument,
    sourceDocuments,
  })

  // Слот-обработчики (после sourceUpload, чтобы получить uploadSourceDocumentForSlot)
  const { editingSlotId, slotFileInputRef, slotHandlers, handleSlotFileChange } = useSlotHandlers({
    kit,
    projectId,
    workspaceId,
    folders,
    uploadDocument,
    createSlot,
    updateSlot,
    deleteSlot,
    deleteEmptySlots,
    fillSlot,
    unlinkSlot,
    refetchSlots,
    fetchDocumentKits,
    loadSourceDocuments: sourceOps.loadSourceDocuments,
    uploadSourceDocumentForSlot: sourceUpload.uploadSourceDocumentForSlot,
  })
  const sourceConnection = useProjectSourceConnection({
    projectId,
    onSuccess: () => {
      fetchDocumentKits(projectId)
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    },
  })
  const destinationOps = useProjectDestinationFolder({
    projectId,
    exportFolderId: exportFolderId ?? null,
    workspaceId,
    setDestinationDocuments,
    setExporting: setExportingToDestination,
    setFetchingDestination,
    setHasExported,
    setExportPhase,
  })

  // Хук для группировки обработчиков
  const handlers = useDocumentKitHandlers({
    kit,
    projectId,
    documentOps,
    documentEdit,
    folderOps,
    documentMerge,
    batchOps,
    compressOps,
    exportOps,
    sourceOps,
    sourceUpload,
    batchMoveOps,
    sourceConnection,
    uploadDocument,
    deleteDocumentKit,
    selectedDocuments,
    clearSelection,
    resetDragState,
    draggedDocId,
    dragOverPosition,
    draggedSourceDoc,
    setExportFolderConnected,
  })

  return {
    documentOps,
    documentEdit,
    documentVerify,
    folderOps,
    documentMerge,
    batchOps,
    compressOps,
    exportOps,
    sourceOps,
    sourceUpload,
    batchMoveOps,
    sourceConnection,
    destinationOps,
    handlers,
    editingSlotId,
    slotFileInputRef,
    slotHandlers,
    handleSlotFileChange,
  }
}
