"use client"

import { useRef } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { getKitIdForFolder } from '@/services/documents/documentKitUtils'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'
import type { DocumentWithFiles, SourceDocument, SourceDocumentInfo } from '@/components/documents'

interface UseBatchMoveOperationsProps {
  projectId: string
  allKits: DocumentKitWithDocuments[]
  fetchDocumentKits: (projectId: string) => Promise<void>
  clearSelection: () => void
  reorderDocuments: (
    updates: {
      id: string
      sort_order: number
      folder_id?: string | null
      document_kit_id?: string
    }[],
  ) => Promise<void>
  uploadSourceDocument: (
    sourceDoc: SourceDocumentInfo,
    folderId: string | null,
    showToast?: boolean,
  ) => Promise<boolean>
  sourceDocuments: SourceDocument[]
}

/**
 * Хук для пакетного перемещения документов между папками
 */
export function useBatchMoveOperations({
  projectId,
  allKits,
  fetchDocumentKits,
  clearSelection,
  reorderDocuments,
  uploadSourceDocument,
  sourceDocuments,
}: UseBatchMoveOperationsProps) {
  const isBatchMovingRef = useRef(false)
  // Z3-01: Guard для одиночного drag&drop — предотвращает race condition при быстром перетаскивании
  const isDragMovingRef = useRef(false)

  /**
   * Пакетное перемещение выбранных документов в папку
   * Поддерживает перемещение как обычных документов, так и документов из источника
   */
  const handleBatchMove = async (
    kit: DocumentKitWithDocuments | undefined,
    selectedDocuments: Set<string>,
    targetFolderId: string | null,
    setBatchMoving: (value: boolean) => void,
  ) => {
    if (selectedDocuments.size === 0 || !kit || isBatchMovingRef.current) return
    isBatchMovingRef.current = true

    setBatchMoving(true)
    const toastId = toast.loading('Перемещение документов...')

    try {
      const selectedIds = Array.from(selectedDocuments)
      // Разделяем выбранные документы на обычные (из всех наборов) и из источника
      const allDocs = allKits.flatMap((k) => k.documents || [])
      const regularDocuments = allDocs.filter((doc) => selectedIds.includes(doc.id))
      const selectedSourceDocuments =
        sourceDocuments?.filter((doc: SourceDocument) => selectedIds.includes(doc.id)) || []
      let successCount = 0
      let errorCount = 0

      // Перемещаем обычные документы (если есть)
      if (regularDocuments.length > 0) {
        const targetKitId = getKitIdForFolder(targetFolderId, allKits)
        const docsInTargetFolder = allDocs.filter(
          (d) => d.folder_id === targetFolderId && !d.is_deleted,
        )

        const maxOrder =
          docsInTargetFolder.length > 0
            ? Math.max(...docsInTargetFolder.map((d) => d.sort_order || 0))
            : -1

        const updates = regularDocuments.map((doc, idx) => ({
          id: doc.id,
          folder_id: targetFolderId,
          sort_order: maxOrder + 1 + idx,
          ...(targetKitId && { document_kit_id: targetKitId }),
        }))

        await reorderDocuments(updates)
        successCount += regularDocuments.length
      }

      // Перемещаем документы из источника (если есть)
      if (selectedSourceDocuments.length > 0) {
        for (const sourceDoc of selectedSourceDocuments) {
          const sourceDocInfo: SourceDocumentInfo = {
            id: sourceDoc.id,
            name: sourceDoc.name,
            sourceDocumentId: sourceDoc.sourceDocumentId || sourceDoc.id,
          }
          const success = await uploadSourceDocument(sourceDocInfo, targetFolderId, false)
          if (success) {
            successCount++
          } else {
            errorCount++
          }
        }
      }

      await fetchDocumentKits(projectId)
      clearSelection()
      setBatchMoving(false)

      if (errorCount === 0) {
        toast.success(`Перемещено документов: ${successCount}`, {
          id: toastId,
          duration: 5000,
        })
      } else {
        toast.warning(`Перемещено: ${successCount}, ошибок: ${errorCount}`, {
          id: toastId,
          duration: 5000,
        })
      }
    } catch (error) {
      logger.error('Ошибка пакетного перемещения документов:', error)
      toast.error('Ошибка при перемещении', { id: toastId })
      setBatchMoving(false)
    } finally {
      isBatchMovingRef.current = false
    }
  }

  /**
   * Drag & drop документа на другой документ (для изменения порядка)
   * При перетаскивании на документ — документ перемещается в ту же папку, что и целевой
   */
  const handleDocumentDrop = async (
    kit: DocumentKitWithDocuments | undefined,
    draggedDocId: string | null,
    targetDoc: DocumentWithFiles,
    dragOverPosition: 'top' | 'bottom' | null,
    resetDragState: () => void,
  ) => {
    // Z3-01: Guard от параллельных drag&drop операций
    if (!draggedDocId || draggedDocId === targetDoc.id || isDragMovingRef.current) {
      resetDragState()
      return
    }

    // Ищем документ во всех китах (для cross-kit drag)
    const allDocs = allKits.flatMap((k) => k.documents || [])
    const draggedDoc = allDocs.find((d) => d.id === draggedDocId)
    if (!draggedDoc) {
      resetDragState()
      return
    }

    isDragMovingRef.current = true

    // Используем папку целевого документа
    const targetFolderId = targetDoc.folder_id

    // Собираем документы в целевой папке из всех китов
    const docsInTargetFolder = allDocs
      .filter((d) => d.folder_id === targetFolderId && !d.is_deleted)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    const filteredDocs = docsInTargetFolder.filter((d) => d.id !== draggedDocId)
    const targetIndex = filteredDocs.findIndex((d) => d.id === targetDoc.id)

    let insertIndex: number
    if (dragOverPosition === 'top') {
      insertIndex = targetIndex
    } else {
      insertIndex = targetIndex + 1
    }

    filteredDocs.splice(insertIndex, 0, draggedDoc)

    // Определяем kit целевой папки для cross-kit перемещения
    const targetKitId = getKitIdForFolder(targetFolderId, allKits)

    const updates = filteredDocs.map((doc, idx) => ({
      id: doc.id,
      sort_order: idx,
      // Если документ перетаскивается из другой папки — меняем folder_id и kit_id
      ...(doc.id === draggedDocId &&
        draggedDoc.folder_id !== targetFolderId && {
          folder_id: targetFolderId,
          ...(targetKitId && { document_kit_id: targetKitId }),
        }),
    }))

    try {
      await reorderDocuments(updates)
      await fetchDocumentKits(projectId)
    } catch (error) {
      logger.error('Ошибка перемещения документа drag & drop:', error)
    } finally {
      isDragMovingRef.current = false
    }

    resetDragState()
  }

  /**
   * Drag & drop документа в папку
   */
  const handleFolderDrop = async (
    kit: DocumentKitWithDocuments | undefined,
    draggedDocId: string | null,
    targetFolderId: string | null,
    resetDragState: () => void,
  ) => {
    // Z3-01: Guard от параллельных drag&drop операций
    if (!draggedDocId || isDragMovingRef.current) {
      resetDragState()
      return
    }

    // Ищем документ во всех китах (для cross-kit drag)
    const allDocs = allKits.flatMap((k) => k.documents || [])
    const draggedDoc = allDocs.find((d) => d.id === draggedDocId)
    if (!draggedDoc) {
      resetDragState()
      return
    }

    // Z3-16: drop на ту же папку — пропускаем лишний запрос в БД
    if (draggedDoc.folder_id === targetFolderId) {
      resetDragState()
      return
    }

    isDragMovingRef.current = true

    const docsInTargetFolder = allDocs.filter(
      (d) => d.folder_id === targetFolderId && !d.is_deleted,
    )

    const maxOrder =
      docsInTargetFolder.length > 0
        ? Math.max(...docsInTargetFolder.map((d) => d.sort_order || 0))
        : -1

    // Определяем kit целевой папки для cross-kit перемещения
    const targetKitId = getKitIdForFolder(targetFolderId, allKits)

    try {
      await reorderDocuments([
        {
          id: draggedDocId,
          sort_order: maxOrder + 1,
          folder_id: targetFolderId,
          ...(targetKitId && { document_kit_id: targetKitId }),
        },
      ])
      await fetchDocumentKits(projectId)
    } catch (error) {
      logger.error('Ошибка перемещения документа в папку:', error)
    } finally {
      isDragMovingRef.current = false
    }

    resetDragState()
  }

  return {
    handleBatchMove,
    handleDocumentDrop,
    handleFolderDrop,
  }
}
