"use client"

/**
 * Batch-обработчики для DocumentKit: пакетные операции, сжатие, экспорт, статусы.
 * Вынесены из useDocumentKitHandlers для декомпозиции.
 */

/* eslint-disable react-hooks/preserve-manual-memoization -- latestRef pattern: ref is stable, empty deps intentional */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import type { LatestHandlersRef } from './documentKitHandlerTypes'

type LatestRef = LatestHandlersRef

export function useDocumentKitBatchHandlers(latestRef: LatestRef) {
  const handleBatchDelete = useCallback(() => {
    const r = latestRef.current
    r.batchOps.handleBatchDelete(r.selectedDocuments)
  }, [])

  const handleBatchHardDelete = useCallback(() => {
    const r = latestRef.current
    r.batchOps.handleBatchHardDelete(r.selectedDocuments)
  }, [])

  const handleBatchCheck = useCallback(() => {
    const r = latestRef.current
    r.batchOps.handleBatchCheck(r.selectedDocuments, r.kit?.documents, r.setCheckingBatch)
  }, [])

  const handleBatchDownload = useCallback(() => {
    const r = latestRef.current
    r.batchOps.handleBatchDownload(r.selectedDocuments, r.kit?.documents, r.folders)
  }, [])

  const handleBatchCompress = useCallback(() => {
    const r = latestRef.current
    r.compressOps.handleBatchCompress(r.selectedDocuments, r.kit?.documents)
  }, [])

  const handleCompressSingleDocument = useCallback((documentId: string) => {
    const r = latestRef.current
    r.compressOps.handleCompressSingleDocument(documentId, r.kit?.documents)
  }, [])

  const handleBatchExportToDisk = useCallback(() => {
    const r = latestRef.current
    if (r.selectedDocuments.size === 0) {
      toast.error('Выберите документы для выгрузки')
      return
    }
    r.setGoogleDriveFolderLink('')
    r.openExportDialog()
  }, [])

  const handleExportToGoogleDrive = useCallback(() => {
    const r = latestRef.current
    r.exportOps.handleExportToGoogleDrive(
      r.googleDriveFolderLink,
      r.exportSyncMode,
      r.selectedDocuments,
      r.kit?.documents,
      r.folders,
      r.setExporting,
      r.setGoogleDriveFolderLink,
      r.closeExportDialog,
    )
  }, [])

  const handleBatchMove = useCallback(async (targetFolderId: string | null) => {
    const r = latestRef.current
    await r.batchMoveOps.handleBatchMove(
      r.kit,
      r.selectedDocuments,
      targetFolderId,
      r.setBatchMoving,
    )
  }, [])

  const handleBatchSetStatus = useCallback(async (statusId: string | null) => {
    const r = latestRef.current
    if (r.selectedDocuments.size === 0) return
    const toastId = toast.loading('Установка статуса...')
    try {
      const selectedIds = Array.from(r.selectedDocuments)
      for (const docId of selectedIds) {
        await r.documentOps.handleStatusChange(docId, statusId)
      }
      toast.success(`Статус обновлён для ${selectedIds.length} документов`, { id: toastId })
    } catch (error) {
      logger.error('Ошибка пакетной установки статуса:', error)
      toast.error('Ошибка при установке статуса', { id: toastId })
    }
  }, [])

  return {
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
  }
}
