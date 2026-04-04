"use client"

/**
 * Операции с документами в карточном представлении:
 * статусы, открытие, скачивание, удаление, сжатие
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { getDocumentPublicUrl, downloadDocumentFile } from '@/services/documents/documentService'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import type { DocumentKitWithDocuments, DocumentWithFiles } from '@/components/documents/types'

interface UseCardViewDocumentActionsParams {
  documentKits: DocumentKitWithDocuments[]
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
      setCompressing: (
        value: boolean,
        docId?: string | null,
        progress?: { current: number; total: number } | null,
      ) => void,
    ) => Promise<void>
  }
  setCompressing: (
    value: boolean,
    docId?: string | null,
    progress?: { current: number; total: number } | null,
  ) => void
}

export function useCardViewDocumentActions({
  documentKits,
  projectId,
  updateDocumentStatus,
  updateFolderStatus,
  softDeleteDocument,
  compressOps,
  setCompressing,
}: UseCardViewDocumentActionsParams) {
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const getDocument = useCallback(
    (docId: string) => {
      for (const kit of documentKits) {
        const doc = kit.documents?.find((d) => d.id === docId)
        if (doc) return doc
      }
      return null
    },
    [documentKits],
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
      const currentFile = doc?.document_files?.find((f) => f.is_current) || doc?.document_files?.[0]
      if (!currentFile?.file_path) {
        toast.error('Файл не найден')
        return
      }
      // Z5-29: try/catch для сетевых ошибок
      try {
        const signedUrl = await getDocumentPublicUrl(currentFile.file_path, currentFile.file_id)
        if (signedUrl) {
          window.open(signedUrl, '_blank')
        } else {
          toast.error('Не удалось получить ссылку на документ')
        }
      } catch {
        toast.error('Ошибка при открытии документа')
      }
    },
    [getDocument],
  )

  const handleDownloadDocument = useCallback(
    async (docId: string) => {
      const doc = getDocument(docId)
      const currentFile = doc?.document_files?.find((f) => f.is_current) || doc?.document_files?.[0]
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
      // Z5-30: try/catch для ошибок сжатия
      try {
        const allDocs = documentKits.flatMap((k) => k.documents || [])
        await compressOps.handleCompressSingleDocument(docId, allDocs, setCompressing)
      } catch {
        toast.error('Ошибка при сжатии документа')
      }
    },
    [documentKits, compressOps, setCompressing],
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
