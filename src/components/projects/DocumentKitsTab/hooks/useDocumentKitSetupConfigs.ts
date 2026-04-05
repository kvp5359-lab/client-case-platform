/**
 * Конфигурации toolbar, batch actions и dialogs для useDocumentKitSetup.
 * Вынесены для декомпозиции основного оркестратора.
 */

import { useSidePanelStore } from '@/store/sidePanelStore'
import type { DocumentWithFiles, SourceDocument, Folder, DocumentStatus } from '@/components/documents/types'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'
import type { DocumentKitHandlers } from './documentKitHandlerTypes'

interface ToolbarParams {
  allSelected: boolean
  showOnlyUnverified: boolean
  isUploading: boolean
  uploadingFilesCount: number
  canAddDocuments: boolean
  canCreateFolders: boolean
  canDownloadDocuments: boolean
  canDeleteDocuments: boolean
  canManageSettings: boolean
  handleSelectAll: () => void
  handleAddDocumentClick: () => void
  toggleShowOnlyUnverified: () => void
  openTemplateSelectDialog: () => void
  closeEditFolderDialog: () => void
  resetFolderForm: () => void
  openAddFolderDialog: () => void
  openConnectSourceDialog: () => void
  openKitSettingsDialog: () => void
  handleDelete: () => Promise<void>
}

export function buildToolbarConfig(p: ToolbarParams) {
  return {
    allSelected: p.allSelected,
    showOnlyUnverified: p.showOnlyUnverified,
    isUploading: p.isUploading,
    uploadingFilesCount: p.uploadingFilesCount,
    canAddDocuments: p.canAddDocuments,
    canCreateFolders: p.canCreateFolders,
    canDownloadDocuments: p.canDownloadDocuments,
    canDeleteDocuments: p.canDeleteDocuments,
    canManageSettings: p.canManageSettings,
    onSelectAll: p.handleSelectAll,
    onAddDocument: p.handleAddDocumentClick,
    onFilterToggle: () => p.toggleShowOnlyUnverified(),
    onAddFolderFromTemplates: () => p.openTemplateSelectDialog(),
    onAddFolder: () => {
      p.closeEditFolderDialog()
      p.resetFolderForm()
      p.openAddFolderDialog()
    },
    onConnectSource: () => p.openConnectSourceDialog(),
    onDownloadArchive: () => {
      /* TODO(low): скачивание архива документов набора */
    },
    onDeleteKit: p.handleDelete,
    onOpenSettings: () => p.openKitSettingsDialog(),
  }
}

interface BatchActionsParams {
  hasSelection: boolean
  selectedDocuments: Set<string>
  hasTrashDocumentsSelected: boolean
  systemSectionTab: string
  sourceDocuments: SourceDocument[]
  allFolders: Folder[]
  statuses: DocumentStatus[]
  operations: {
    isMerging: boolean
    isCompressing: boolean
    isCheckingBatch: boolean
    isExportingToDisk: boolean
    mergeProgress: number
    compressProgress: number
    exportProgress: number
  }
  permissions: {
    canBatchCheck: boolean
    canCompress: boolean
    canMove: boolean
    canDelete: boolean
    canDownload: boolean
  }
  allFilteredDocuments: DocumentWithFiles[]
  handlers: DocumentKitHandlers
  clearSelection: () => void
  sourceOps: { toggleSourceDocumentHidden: (fileId: string, isHidden: boolean) => Promise<void> }
}

export function buildBatchActionsConfig(p: BatchActionsParams) {
  return {
    hasSelection: p.hasSelection,
    selectedCount: p.selectedDocuments.size,
    hasTrashDocumentsSelected: p.hasTrashDocumentsSelected,
    isSourceTab: p.systemSectionTab === 'source',
    selectedSourceDocsAllHidden: (() => {
      if (p.systemSectionTab !== 'source' || p.selectedDocuments.size === 0) return false
      const selectedSourceDocs = p.sourceDocuments.filter((d) => p.selectedDocuments.has(d.id))
      return selectedSourceDocs.length > 0 && selectedSourceDocs.every((d) => d.isHidden)
    })(),
    folders: p.allFolders,
    statuses: p.statuses,
    operations: p.operations,
    permissions: p.permissions,
    handlers: {
      onClearSelection: p.clearSelection,
      onBatchCheck: p.handlers.handleBatchCheck,
      onMerge: p.handlers.handleOpenMergeDialog,
      onBatchCompress: p.handlers.handleBatchCompress,
      onBatchMove: p.handlers.handleBatchMove,
      onBatchDelete: p.handlers.handleBatchDelete,
      onBatchHardDelete: p.handlers.handleBatchHardDelete,
      onBatchDownload: p.handlers.handleBatchDownload,
      onBatchSetStatus: p.handlers.handleBatchSetStatus,
      onOpenAIChat: () => {
        const docs = p.allFilteredDocuments
          .filter((d) => p.selectedDocuments.has(d.id))
          .map((d) => ({
            id: d.id,
            name: d.name,
            textContent: d.text_content ?? null,
          }))
        if (docs.length > 0) {
          useSidePanelStore.getState().openAssistantWithDocuments(docs)
        }
      },
      onBatchToggleHidden: async (hide: boolean) => {
        const selectedSourceDocs = p.sourceDocuments.filter((d) => p.selectedDocuments.has(d.id))
        for (const doc of selectedSourceDocs) {
          await p.sourceOps.toggleSourceDocumentHidden(doc.sourceDocumentId, !hide)
        }
        p.clearSelection()
      },
    },
  }
}

// Confirm dialog props — прокидываются as-is, не инспектируются
import type { ConfirmDialogState } from '@/hooks/dialogs/useConfirmDialog'
interface ConfirmDialogLike {
  state: ConfirmDialogState
  onConfirm: () => void
  onCancel: () => void
}

interface DialogsParams {
  documentOps: { confirmDialogProps: ConfirmDialogLike; handleOpen: (documentId: string) => void }
  folderOps: {
    confirmDialogProps: ConfirmDialogLike
    handleToggleTemplateSelection: (id: string) => void
    handleCreateFoldersFromTemplates: (kit: DocumentKitWithDocuments | undefined) => Promise<void>
    handleSaveFolder: (kit: DocumentKitWithDocuments | undefined) => Promise<void>
  }
  documentMerge: {
    confirmDialogProps: ConfirmDialogLike
    handleRemoveFromMerge: (id: string) => void
    handleDragStart: (index: number) => void
    handleDragOver: (e: React.DragEvent, index: number) => void
    handleDragEnd: () => void
  }
  batchOps: {
    batchDeleteConfirmDialogProps: ConfirmDialogLike
    batchHardDeleteConfirmDialogProps: ConfirmDialogLike
  }
  documentEdit: {
    handleSaveDocument: (...args: unknown[]) => void
    handleViewContent: (...args: unknown[]) => void
    handleClearContent: (...args: unknown[]) => void
  }
  documentVerify: { handleVerifyDocument: (...args: unknown[]) => void }
  handlers: DocumentKitHandlers
  kit: DocumentKitWithDocuments | undefined
  documentToEdit: DocumentWithFiles | null
  batchCheckDialogOpen: boolean
  batchCheckDocumentIds: string[]
  documentNamesMap: Map<string, string>
  statuses: DocumentStatus[]
  closeBatchCheckDialog: () => void
  fetchDocumentKits: (projectId: string) => Promise<void>
  clearSelection: () => void
  projectId: string
  workspaceId: string
}

export function buildDialogsConfig(p: DialogsParams) {
  return {
    confirmDialogs: {
      documentOps: p.documentOps.confirmDialogProps,
      folderOps: p.folderOps.confirmDialogProps,
      documentMerge: p.documentMerge.confirmDialogProps,
      batchDelete: p.batchOps.batchDeleteConfirmDialogProps,
      batchHardDelete: p.batchOps.batchHardDeleteConfirmDialogProps,
      handlers: p.handlers.confirmDialogProps,
    },
    documentKitDialogHandlers: {
      onMoveDocument: p.handlers.handleMoveDocument,
      onMoveSourceDocument: p.handlers.handleMoveSourceDocumentToFolder,
      onSaveDocument: p.documentEdit.handleSaveDocument,
      onVerifyDocument: p.documentVerify.handleVerifyDocument,
      onViewContent: p.documentEdit.handleViewContent,
      onOpenDocument: p.documentToEdit
        ? () => p.documentOps.handleOpen(p.documentToEdit!.id)
        : undefined,
      onOpenAIChat: p.documentToEdit?.text_content
        ? () => {
            useSidePanelStore.getState().openAssistantWithDocuments([
              {
                id: p.documentToEdit!.id,
                name: p.documentToEdit!.name,
                textContent: p.documentToEdit!.text_content ?? null,
              },
            ])
          }
        : undefined,
      onClearContent: p.documentEdit.handleClearContent,
      onToggleTemplateSelection: p.folderOps.handleToggleTemplateSelection,
      onCreateFoldersFromTemplates: () => p.folderOps.handleCreateFoldersFromTemplates(p.kit),
      onSaveFolder: () => p.folderOps.handleSaveFolder(p.kit),
      onRemoveFromMerge: p.documentMerge.handleRemoveFromMerge,
      onMergeDragStart: p.documentMerge.handleDragStart,
      onMergeDragOver: p.documentMerge.handleDragOver,
      onMergeDragEnd: p.documentMerge.handleDragEnd,
      onGenerateMergeName: p.handlers.handleGenerateMergeName,
      onMergeDocuments: p.handlers.handleMergeDocuments,
      onConnectSource: p.handlers.handleConnectSource,
      onSaveSourceSettings: p.handlers.handleSaveSourceSettings,
      onExportToGoogleDrive: p.handlers.handleExportToGoogleDrive,
      onSaveExportSettings: p.handlers.handleSaveExportSettings,
    },
    batchCheck: {
      open: p.batchCheckDialogOpen,
      documentIds: p.batchCheckDocumentIds,
      documentNames: p.documentNamesMap,
      statuses: p.statuses,
      onClose: p.closeBatchCheckDialog,
      onComplete: () => {
        p.fetchDocumentKits(p.projectId)
        p.clearSelection()
      },
    },
  }
}
