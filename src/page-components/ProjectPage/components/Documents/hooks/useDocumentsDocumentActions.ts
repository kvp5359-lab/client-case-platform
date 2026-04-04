"use client"

/**
 * Операции с документами:
 * статусы, открытие, скачивание, удаление, сжатие
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { openDocumentInNewTab, downloadDocumentFile } from '@/services/documents/documentService'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import type { DocumentKitWithDocuments, DocumentWithFiles } from '@/components/documents/types'
import { getCurrentDocumentFile } from '@/utils/documentUtils'

interface UseDocumentsDocumentActionsParams {
  documentKits: DocumentKitWithDocuments[]
  kitlessDocuments?: DocumentWithFiles[]
  projectId: string
  updateDocumentStatus: (params: { documentId: string; status: string | null }) => Promise<void>
  updateFolderStatus: {
    mutateAsync: (params: {
      folderId: string
      status: string | null
      projectId: string
    }) => Promise<void>
  }
  softDeleteDocument: (documentId: string) => Promise<void>
  compressOps: {
    handleCompressSingleDocument: (
      docId: string,
      allDocs: DocumentWithFiles[] | undefined,
    ) => Promise<void>
  }
}

export function useDocumentsDocumentActions({
  documentKits,
  kitlessDocuments = [],
  projectId,
  updateDocumentStatus,
  updateFolderStatus,
  softDeleteDocument,
  compressOps,
}: UseDocumentsDocumentActionsParams) {
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const getDocument = useCallback(
    (docId: string) => {
      for (const kit of documentKits) {
        const doc = kit.documents?.find((d) => d.id === docId)
        if (doc) return doc
      }
      // Также искать среди нераспределённых документов (kitless)
      return kitlessDocuments.find((d) => d.id === docId) ?? null
    },
    [documentKits, kitlessDocuments],
  )

  const getKit = useCallback(
    (docId: string) => {
      return documentKits.find((kit) => kit.documents?.some((d) => d.id === docId))
    },
    [documentKits],
  )

  const handleStatusChange = useCallback(
    async (docId: string, newStatus: string | null) => {
      try {
        await updateDocumentStatus({ documentId: docId, status: newStatus })
      } catch {
        toast.error('Не удалось обновить статус документа')
      }
    },
    [updateDocumentStatus],
  )

  const handleFolderStatusChange = useCallback(
    async (folderId: string, newStatus: string | null) => {
      try {
        await updateFolderStatus.mutateAsync({ folderId, status: newStatus, projectId })
      } catch {
        toast.error('Не удалось обновить статус папки')
      }
    },
    [updateFolderStatus, projectId],
  )

  const handleOpenDocumentById = useCallback(
    async (docId: string) => {
      const doc = getDocument(docId)
      const currentFile = getCurrentDocumentFile(doc?.document_files)
      if (!currentFile?.file_path) {
        toast.error('Файл не найден')
        return
      }
      try {
        await openDocumentInNewTab(currentFile.file_path, currentFile.file_id)
      } catch {
        toast.error('Ошибка при открытии документа')
      }
    },
    [getDocument],
  )

  const handleDownloadDocument = useCallback(
    async (docId: string) => {
      const doc = getDocument(docId)
      const currentFile = getCurrentDocumentFile(doc?.document_files)
      if (!currentFile?.file_path) {
        toast.error('Файл не найден')
        return
      }
      try {
        await downloadDocumentFile(
          currentFile.file_path,
          currentFile.file_name || 'document',
          currentFile.file_id,
        )
      } catch {
        toast.error('Ошибка при скачивании файла')
      }
    },
    [getDocument],
  )

  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      const doc = getDocument(docId)
      const docName = doc?.name || 'документ'

      const ok = await confirm({
        title: `Переместить «${docName}» в корзину?`,
        description: 'Документ можно будет восстановить из корзины.',
        variant: 'destructive',
        confirmText: 'В корзину',
      })
      if (!ok) return

      try {
        await softDeleteDocument(docId)
        toast.success('Документ перемещён в корзину')
      } catch {
        toast.error('Ошибка при удалении документа')
      }
    },
    [softDeleteDocument, getDocument, confirm],
  )

  const handleCompressDocument = useCallback(
    async (docId: string) => {
      try {
        const allDocs = documentKits.flatMap((k) => k.documents || [])
        await compressOps.handleCompressSingleDocument(docId, allDocs)
      } catch {
        toast.error('Ошибка при сжатии документа')
      }
    },
    [documentKits, compressOps],
  )

  return {
    getKit,
    getDocument,
    handleStatusChange,
    handleFolderStatusChange,
    handleOpenDocumentById,
    handleDownloadDocument,
    handleDeleteDocument,
    handleCompressDocument,
    confirmDialogProps: { state: confirmState, onConfirm: handleConfirm, onCancel: handleCancel },
  }
}
