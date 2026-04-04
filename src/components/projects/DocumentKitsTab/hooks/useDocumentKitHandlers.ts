"use client"

/**
 * Хук для группировки обработчиков событий DocumentKitsTab
 * Объединяет обработчики из разных хуков в единый интерфейс
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import { useDocumentKitBatchHandlers } from './useDocumentKitBatchHandlers'
import { useDocumentKitDragDropHandlers } from './useDocumentKitDragDropHandlers'
import type { UseDocumentKitHandlersProps, DocumentKitHandlers } from './documentKitHandlerTypes'

export function useDocumentKitHandlers({
  kit,
  documentOps,
  documentEdit,
  folderOps,
  documentMerge,
  batchOps,
  compressOps,
  exportOps,
  sourceUpload,
  batchMoveOps,
  sourceConnection,
  uploadDocument,
  deleteDocumentKit,
  selectedDocuments,
  resetDragState,
  draggedDocId,
  dragOverPosition,
  draggedSourceDoc,
  setExportFolderConnected,
}: UseDocumentKitHandlersProps): DocumentKitHandlers {
  const router = useRouter()
  const pathname = usePathname()
  const {
    state: confirmState,
    confirm,
    handleConfirm: onConfirmDialog,
    handleCancel: onCancelDialog,
  } = useConfirmDialog()

  // State
  const documentToMove = useDocumentKitUIStore((state) => state.documentToMove)
  const sourceDocToMove = useDocumentKitUIStore((state) => state.sourceDocToMove)
  const sourceFolderLink = useDocumentKitUIStore((state) => state.sourceFolderLink)
  const googleDriveFolderLink = useDocumentKitUIStore((state) => state.googleDriveFolderLink)
  const exportSyncMode = useDocumentKitUIStore((state) => state.exportSyncMode)
  const mergeDocsList = useDocumentKitUIStore((state) => state.mergeDocsList)

  // Actions
  const {
    closeMoveDialog,
    closeSourceMoveDialog,
    setMovingSourceDoc,
    setBatchMoving,
    setStatusDropdownOpen,
    setCheckingBatch,
    openExportDialog,
    closeExportDialog,
    setGoogleDriveFolderLink,
    setExporting,
    closeConnectSourceDialog,
    setSourceFolderLink,
    setSourceConnected,
    setSyncing,
  } = useDocumentKitUIStore()

  const folders = kit?.folders || []

  // Ref для актуальных значений — позволяет useCallback не зависеть от замыканий
  const latestRef = useRef({
    kit,
    documentOps,
    documentEdit,
    folderOps,
    documentMerge,
    batchOps,
    compressOps,
    exportOps,
    sourceUpload,
    batchMoveOps,
    sourceConnection,
    uploadDocument,
    deleteDocumentKit,
    selectedDocuments,
    resetDragState,
    draggedDocId,
    dragOverPosition,
    draggedSourceDoc,
    setExportFolderConnected,
    documentToMove,
    sourceDocToMove,
    sourceFolderLink,
    googleDriveFolderLink,
    exportSyncMode,
    mergeDocsList,
    folders,
    navigate,
    location,
    confirm,
    closeMoveDialog,
    closeSourceMoveDialog,
    setMovingSourceDoc,
    setBatchMoving,
    setStatusDropdownOpen,
    setCheckingBatch,
    openExportDialog,
    closeExportDialog,
    setGoogleDriveFolderLink,
    setExporting,
    closeConnectSourceDialog,
    setSourceFolderLink,
    setSourceConnected,
    setSyncing,
  })
  useEffect(() => {
    latestRef.current = {
      kit,
      documentOps,
      documentEdit,
      folderOps,
      documentMerge,
      batchOps,
      compressOps,
      exportOps,
      sourceUpload,
      batchMoveOps,
      sourceConnection,
      uploadDocument,
      deleteDocumentKit,
      selectedDocuments,
      resetDragState,
      draggedDocId,
      dragOverPosition,
      draggedSourceDoc,
      setExportFolderConnected,
      documentToMove,
      sourceDocToMove,
      sourceFolderLink,
      googleDriveFolderLink,
      exportSyncMode,
      mergeDocsList,
      folders,
      navigate,
      location,
      confirm,
      closeMoveDialog,
      closeSourceMoveDialog,
      setMovingSourceDoc,
      setBatchMoving,
      setStatusDropdownOpen,
      setCheckingBatch,
      openExportDialog,
      closeExportDialog,
      setGoogleDriveFolderLink,
      setExporting,
      closeConnectSourceDialog,
      setSourceFolderLink,
      setSourceConnected,
      setSyncing,
    }
  })

  // === ОБРАБОТЧИКИ ДОКУМЕНТОВ ===

  const handleOpenEditDialog = useCallback((documentId: string) => {
    const r = latestRef.current
    r.documentEdit.handleOpenEditDialog(documentId, r.kit)
  }, [])

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const r = latestRef.current
    r.folderOps.handleFileChange(event, r.kit, r.uploadDocument)
  }, [])

  const handleDelete = useCallback(async () => {
    const r = latestRef.current
    if (!r.kit) return
    const ok = await r.confirm({
      title: 'Удалить набор документов?',
      description: 'Все документы в наборе также будут удалены.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    try {
      await r.deleteDocumentKit(r.kit.id)
      r.navigate(r.pathname + '?tab=settings', { replace: true })
    } catch (error) {
      logger.error('Ошибка удаления набора документов:', error)
      toast.error('Не удалось удалить набор документов')
    }
  }, [])

  const handleUpdateStatus = useCallback(async (documentId: string, newStatus: string | null) => {
    const r = latestRef.current
    await r.documentOps.handleStatusChange(documentId, newStatus, () =>
      r.setStatusDropdownOpen(null),
    )
  }, [])

  const handleMoveDocument = useCallback(async (folderId: string | null) => {
    const r = latestRef.current
    if (!r.documentToMove) return
    await r.documentOps.handleMove(r.documentToMove, folderId, r.closeMoveDialog)
  }, [])

  const handleMoveSourceDocumentToFolder = useCallback(async (folderId: string | null) => {
    const r = latestRef.current
    if (!r.sourceDocToMove) return
    r.setMovingSourceDoc(true)
    const success = await r.sourceUpload.uploadSourceDocument(r.sourceDocToMove, folderId)
    if (success) {
      r.closeMoveDialog()
      r.closeSourceMoveDialog()
    }
    r.setMovingSourceDoc(false)
  }, [])

  // Batch-обработчики (пакетные операции, сжатие, экспорт, статусы)
  const {
    handleBatchDelete,
    handleBatchHardDelete,
    handleBatchCheck,
    handleBatchDownload,
    handleBatchCompress,
    handleCompressSingleDocument,
    handleBatchExportToDisk,
    handleExportToGoogleDrive,
    handleBatchMove,
    handleBatchSetStatus,
  } = useDocumentKitBatchHandlers(latestRef)

  // Drag & Drop, Merge, Source обработчики
  const {
    handleDocDrop,
    handleFolderDrop,
    handleOpenMergeDialog,
    handleMergeDocuments,
    handleGenerateMergeName,
    handleConnectSource,
    handleSaveSourceSettings,
    handleSaveExportSettings,
  } = useDocumentKitDragDropHandlers(latestRef)

  const confirmDialogProps = useMemo(
    () => ({ state: confirmState, onConfirm: onConfirmDialog, onCancel: onCancelDialog }),
    [confirmState, onConfirmDialog, onCancelDialog],
  )

  // Мемоизированный объект — ссылка стабильна, т.к. все useCallback имеют [] зависимостей
  return useMemo(
    () => ({
      handleOpenEditDialog,
      handleUpdateStatus,
      handleMoveDocument,
      handleMoveSourceDocumentToFolder,
      handleFileChange,
      handleDelete,
      handleDocDrop,
      handleFolderDrop,
      handleBatchDelete,
      handleBatchHardDelete,
      handleBatchCheck,
      handleBatchDownload,
      handleBatchCompress,
      handleCompressSingleDocument,
      handleBatchExportToDisk,
      handleExportToGoogleDrive,
      handleBatchMove,
      handleBatchSetStatus,
      handleOpenMergeDialog,
      handleMergeDocuments,
      handleGenerateMergeName,
      handleConnectSource,
      handleSaveSourceSettings,
      handleSaveExportSettings,
      confirmDialogProps,
    }),
    [
      handleOpenEditDialog,
      handleUpdateStatus,
      handleMoveDocument,
      handleMoveSourceDocumentToFolder,
      handleFileChange,
      handleDelete,
      handleDocDrop,
      handleFolderDrop,
      handleBatchDelete,
      handleBatchHardDelete,
      handleBatchCheck,
      handleBatchDownload,
      handleBatchCompress,
      handleCompressSingleDocument,
      handleBatchExportToDisk,
      handleExportToGoogleDrive,
      handleBatchMove,
      handleBatchSetStatus,
      handleOpenMergeDialog,
      handleMergeDocuments,
      handleGenerateMergeName,
      handleConnectSource,
      handleSaveSourceSettings,
      handleSaveExportSettings,
      confirmDialogProps,
    ],
  )
}
