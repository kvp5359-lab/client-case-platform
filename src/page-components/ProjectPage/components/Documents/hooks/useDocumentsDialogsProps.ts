"use client"

/**
 * Сборка props для <DocumentsDialogs>. Главная цель — вынуть огромный
 * декларативный блок из DocumentsTabContent. Сам хук бизнес-логики не
 * содержит: он берёт уже готовые подхуки/мутации и раскладывает их
 * в плоский объект, который компонент раздаёт дочерним диалогам через spread.
 *
 * Внутри хук ещё подключает Zustand-селекторы документного стора
 * (editDialog, contentView, merge, compress) — чтобы не тащить их в
 * оркестратор: это единственное место, где они реально нужны.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import type { DocumentKitWithDocuments, DocumentStatus } from '@/components/documents/types'
import {
  useDocumentKitUIStore,
  useEditDialogState,
  useContentViewState,
  useMergeDialogState,
} from '@/store/documentKitUI'
import type { DocumentsDialogsProps } from '../DocumentsDialogs'
import type { useDocumentsDialogActions } from './useDocumentsDialogActions'
import type { useDocumentsDocumentActions } from './useDocumentsDocumentActions'
import type { useDocumentsFileUpload } from './useDocumentsFileUpload'
import type { useKitlessUpload } from './useKitlessUpload'
import type { useKitActions } from './useKitActions'
import type { useKitDownload } from './useKitDownload'
import type { useFolderCRUD } from './useFolderCRUD'
import type { useCompressAnalysis } from './useCompressAnalysis'

type DialogActions = ReturnType<typeof useDocumentsDialogActions>
type DocActions = ReturnType<typeof useDocumentsDocumentActions>
type FileUpload = ReturnType<typeof useDocumentsFileUpload>
type KitlessUpload = ReturnType<typeof useKitlessUpload>
type KitActions = ReturnType<typeof useKitActions>
type KitDownload = ReturnType<typeof useKitDownload>
type FolderCRUD = ReturnType<typeof useFolderCRUD>
type CompressAnalysis = ReturnType<typeof useCompressAnalysis>

interface UseDocumentsDialogsPropsParams {
  workspaceId: string
  documentKits: DocumentKitWithDocuments[]
  statuses: DocumentStatus[]
  isMoving: boolean
  isDuplicating: boolean
  dialogActions: DialogActions
  docActions: DocActions
  fileUpload: FileUpload
  kitlessUpload: KitlessUpload
  kitActions: KitActions
  kitDownload: KitDownload
  folderCRUD: FolderCRUD
  compressAnalysis: CompressAnalysis
}

export function useDocumentsDialogsProps({
  workspaceId,
  documentKits,
  statuses,
  isMoving,
  isDuplicating,
  dialogActions,
  docActions,
  fileUpload,
  kitlessUpload,
  kitActions,
  kitDownload,
  folderCRUD,
  compressAnalysis,
}: UseDocumentsDialogsPropsParams): DocumentsDialogsProps {
  const {
    editDialogOpen,
    documentToEdit,
    editName,
    editDescription,
    editStatus,
    suggestedNames,
    isCheckingDocument,
  } = useEditDialogState()
  const { contentViewDialogOpen, documentContent, isLoadingContent } = useContentViewState()
  const {
    mergeDialogOpen,
    mergeDocsList,
    mergeName,
    mergeFolderId,
    isMerging,
    isGeneratingMergeName,
    draggedIndex,
  } = useMergeDialogState()
  const closeEditDialog = useDocumentKitUIStore((s) => s.closeEditDialog)
  const updateEditForm = useDocumentKitUIStore((s) => s.updateEditForm)
  const closeContentViewDialog = useDocumentKitUIStore((s) => s.closeContentViewDialog)
  const openMergeDialog = useDocumentKitUIStore((s) => s.openMergeDialog)
  const closeMergeDialog = useDocumentKitUIStore((s) => s.closeMergeDialog)
  const updateMergeName = useDocumentKitUIStore((s) => s.updateMergeName)
  const setMergeFolder = useDocumentKitUIStore((s) => s.setMergeFolder)

  const {
    moveDialog,
    allFolders,
    folderGroups,
    handleMoveToFolder,
    duplicateDialog,
    handleDuplicateToFolder,
    batchActions,
    documentEdit,
    documentVerify,
    documentMerge,
    summary,
  } = dialogActions

  const handleOpenDocument = useCallback(async () => {
    if (!documentToEdit) return
    await docActions.handleOpenDocumentById(documentToEdit.id)
  }, [documentToEdit, docActions])

  const handleMergeDocuments = useCallback(() => {
    const allDocs = documentKits.flatMap((kit) => kit.documents ?? [])
    const kitForMerge = documentKits.find((kit) =>
      mergeDocsList.some((m) => kit.documents?.some((d) => d.id === m.id)),
    )
    if (!kitForMerge) {
      toast.error('Набор документов не найден')
      return
    }
    documentMerge.handleMergeDocuments({ documentKitId: kitForMerge.id, allDocuments: allDocs })
  }, [documentKits, mergeDocsList, documentMerge])

  return {
    editDocumentDialog: {
      open: editDialogOpen,
      onOpenChange: (open) => {
        if (!open) closeEditDialog()
      },
      name: editName,
      description: editDescription,
      status: editStatus,
      suggestedNames,
      isCheckingDocument,
      documentToEdit,
      statuses,
      onNameChange: (name) => updateEditForm('name', name),
      onDescriptionChange: (desc) => updateEditForm('description', desc),
      onStatusChange: (status) => updateEditForm('status', status),
      onSave: documentEdit.handleSaveDocument,
      onVerify: documentVerify.handleVerifyDocument,
      onViewContent: documentEdit.handleViewContent,
      onOpenDocument: handleOpenDocument,
    },
    contentViewDialog: {
      open: contentViewDialogOpen,
      onOpenChange: (open) => {
        if (!open) closeContentViewDialog()
      },
      documentName: documentToEdit?.name || '',
      content: documentContent,
      isLoading: isLoadingContent,
      onClearContent: documentEdit.handleClearContent,
    },
    hiddenFileInputs: {
      fileInputRef: fileUpload.fileInputRef,
      slotFileInputRef: fileUpload.slotFileInputRef,
      onFileChange: fileUpload.handleFileChange,
      onSlotFileChange: fileUpload.handleSlotFileChange,
      kitlessFileInputRef: kitlessUpload.kitlessFileInputRef,
      onKitlessFileChange: kitlessUpload.handleKitlessFileChange,
    },
    summaryDialog: {
      open: summary.summaryDialogOpen,
      onOpenChange: summary.setSummaryDialogOpen,
      text: summary.summaryText,
      loading: summary.summaryLoading,
      copied: summary.copied,
      onCopy: summary.handleCopySummary,
    },
    moveDocumentDialog: {
      open: moveDialog.isOpen,
      onOpenChange: (open) => !open && moveDialog.close(),
      folders: allFolders,
      folderGroups,
      isMoving,
      onMove: handleMoveToFolder,
    },
    duplicateDocumentDialog: {
      open: duplicateDialog.isOpen,
      onOpenChange: (open) => !open && duplicateDialog.close(),
      folders: allFolders,
      folderGroups,
      isMoving: isDuplicating,
      title: 'Дублировать документ',
      description: 'Выберите группу, в которую хотите дублировать документ',
      onMove: handleDuplicateToFolder,
    },
    mergeDocumentsDialog: {
      open: mergeDialogOpen,
      onOpenChange: (open) => (open ? openMergeDialog([]) : closeMergeDialog()),
      mergeDocsList,
      mergeName,
      mergeFolderId,
      folders: allFolders,
      isMerging,
      isGeneratingName: isGeneratingMergeName,
      draggedIndex,
      onNameChange: updateMergeName,
      onFolderChange: setMergeFolder,
      onRemoveDoc: documentMerge.handleRemoveFromMerge,
      onDragStart: documentMerge.handleDragStart,
      onDragOver: documentMerge.handleDragOver,
      onDragEnd: documentMerge.handleDragEnd,
      onGenerateName: () => documentMerge.generateMergeNameWithAI(mergeDocsList),
      onMerge: handleMergeDocuments,
    },
    folderDialog: {
      open: folderCRUD.folderDialog.isOpen,
      onOpenChange: (open) => !open && folderCRUD.folderDialog.close(),
      isEditing: !!folderCRUD.editingFolderId,
      name: folderCRUD.folderName,
      description: folderCRUD.folderDescription,
      aiNamingPrompt: folderCRUD.folderAiNamingPrompt,
      aiCheckPrompt: folderCRUD.folderAiCheckPrompt,
      knowledgeArticleId: folderCRUD.folderKnowledgeArticleId,
      workspaceId,
      onNameChange: folderCRUD.setFolderName,
      onDescriptionChange: folderCRUD.setFolderDescription,
      onAiNamingPromptChange: folderCRUD.setFolderAiNamingPrompt,
      onAiCheckPromptChange: folderCRUD.setFolderAiCheckPrompt,
      onKnowledgeArticleChange: folderCRUD.setFolderKnowledgeArticleId,
      onSave: folderCRUD.handleSaveFolder,
      isSaving: folderCRUD.isSavingFolder,
    },
    deleteKitDialog: {
      open: !!kitActions.deleteKitDialogOpen,
      kitName: kitActions.deleteKitDialogOpen?.name ?? '',
      onConfirm: kitActions.handleDeleteKitConfirm,
      onCancel: () => kitActions.setDeleteKitDialogOpen(null),
    },
    docActionsConfirm: docActions.confirmDialogProps,
    deleteFolderConfirm: {
      state: folderCRUD.deleteFolderConfirmState,
      onConfirm: folderCRUD.deleteFolderHandleConfirm,
      onCancel: folderCRUD.deleteFolderHandleCancel,
    },
    syncKitConfirm: {
      state: kitActions.syncKitConfirmState,
      onConfirm: kitActions.syncKitHandleConfirm,
      onCancel: kitActions.syncKitHandleCancel,
    },
    mergeConfirm: documentMerge.confirmDialogProps,
    batchActionsProps: batchActions.batchActionsProps,
    batchDeleteConfirm: batchActions.batchDeleteConfirmProps,
    batchHardDeleteConfirm: batchActions.batchHardDeleteConfirmProps,
    batchDownloadDialog: batchActions.downloadDialogProps,
    kitDownloadDialog: kitDownload.kitDownloadDialogProps,
    compressAnalysisDialog: {
      open: compressAnalysis.compressAnalysisOpen,
      onOpenChange: compressAnalysis.setCompressAnalysisOpen,
      items: compressAnalysis.compressAnalysisItems,
      onHighlight: compressAnalysis.handleHighlightCompressDocs,
    },
  }
}
