"use client"

/**
 * Handlers для операций с документами
 * Выделено из useDocumentKitContextHandlers для разделения ответственности
 */

import { useCallback, useMemo } from 'react'
import type { DocumentWithFiles, SourceDocument } from '@/components/documents/types'

interface UseDocumentHandlersParams {
  handlers: {
    handleOpenEditDialog: (documentId: string) => void
    handleUpdateStatus: (documentId: string, newStatus: string | null) => Promise<void>
    handleCompressSingleDocument: (documentId: string) => void
  }
  documentOps: {
    handleOpen: (documentId: string) => void
    handleDownload: (documentId: string) => Promise<void>
    handleSoftDelete: (documentId: string) => Promise<void>
    handleRestore: (documentId: string) => Promise<void>
    handleHardDelete: (documentId: string) => Promise<void>
  }
  openMoveDialog: (docId: string) => void
  setHoveredDocument: (docId: string | null) => void
  toggleDocumentSelection: (
    docId: string,
    documents: DocumentWithFiles[],
    event?: React.MouseEvent,
  ) => void
  systemSectionTab: 'unassigned' | 'source' | 'destination' | 'trash'
  sourceDocuments: SourceDocument[]
  trashedDocuments: DocumentWithFiles[]
  ungroupedDocuments: DocumentWithFiles[]
  /** Плоский список документов (папки + нераспределённые) для Shift-выделения */
  orderedDocumentList: DocumentWithFiles[]
}

export function useDocumentHandlers(params: UseDocumentHandlersParams) {
  const {
    handlers,
    documentOps,
    openMoveDialog,
    setHoveredDocument,
    toggleDocumentSelection,
    sourceDocuments,
    trashedDocuments,
    orderedDocumentList,
  } = params

  // Деструктурируем для стабильных зависимостей useCallback
  const { handleOpenEditDialog, handleUpdateStatus, handleCompressSingleDocument } = handlers
  const { handleOpen, handleDownload, handleSoftDelete, handleRestore, handleHardDelete } =
    documentOps

  const onSelectDocument = useCallback(
    (docId: string, event?: React.MouseEvent) => {
      // Определяем список по принадлежности документа, а не по активной вкладке
      let documentList: (DocumentWithFiles | SourceDocument)[]
      if (sourceDocuments.some((d) => d.id === docId)) {
        documentList = sourceDocuments
      } else if (trashedDocuments.some((d) => d.id === docId)) {
        documentList = trashedDocuments
      } else {
        documentList = orderedDocumentList
      }
      toggleDocumentSelection(docId, documentList as DocumentWithFiles[], event)
    },
    [sourceDocuments, trashedDocuments, orderedDocumentList, toggleDocumentSelection],
  )

  const onHoverDocument = useCallback(
    (docId: string | null) => setHoveredDocument(docId),
    [setHoveredDocument],
  )

  const onOpenEditDocument = useCallback(
    (docId: string) => handleOpenEditDialog(docId),
    [handleOpenEditDialog],
  )

  const onOpenDocument = useCallback((docId: string) => handleOpen(docId), [handleOpen])

  const onDownloadDocument = useCallback((docId: string) => handleDownload(docId), [handleDownload])

  const onCompressDocument = useCallback(
    (docId: string) => handleCompressSingleDocument(docId),
    [handleCompressSingleDocument],
  )

  const onMoveDocument = useCallback((docId: string) => openMoveDialog(docId), [openMoveDialog])

  const onDeleteDocument = useCallback(
    (docId: string) => handleSoftDelete(docId),
    [handleSoftDelete],
  )

  const onRestoreDocument = useCallback((docId: string) => handleRestore(docId), [handleRestore])

  const onHardDeleteDocument = useCallback(
    (docId: string) => handleHardDelete(docId),
    [handleHardDelete],
  )

  const onStatusChange = useCallback(
    (docId: string, statusId: string | null) => handleUpdateStatus(docId, statusId),
    [handleUpdateStatus],
  )

  return useMemo(
    () => ({
      onSelectDocument,
      onHoverDocument,
      onOpenEditDocument,
      onOpenDocument,
      onDownloadDocument,
      onCompressDocument,
      onMoveDocument,
      onDeleteDocument,
      onRestoreDocument,
      onHardDeleteDocument,
      onStatusChange,
    }),
    [
      onSelectDocument,
      onHoverDocument,
      onOpenEditDocument,
      onOpenDocument,
      onDownloadDocument,
      onCompressDocument,
      onMoveDocument,
      onDeleteDocument,
      onRestoreDocument,
      onHardDeleteDocument,
      onStatusChange,
    ],
  )
}
