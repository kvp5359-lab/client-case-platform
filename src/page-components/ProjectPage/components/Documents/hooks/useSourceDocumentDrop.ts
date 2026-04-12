"use client"

/**
 * Хук для drag & drop source-документов из панели "Источник"
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useSourceDocumentUpload } from '@/components/projects/DocumentKitsTab/hooks/useSourceDocumentUpload'
import { useInvalidateSourceDocuments } from '@/hooks/documents/useSourceDocumentsQuery'
import type { SourceDocumentInfo } from '@/components/documents/types'
import type { DocumentKitWithDocuments } from '@/components/documents/types'

interface UseSourceDocumentDropParams {
  documentKits: DocumentKitWithDocuments[]
  projectId: string
  workspaceId: string
  invalidateDocumentKits: () => Promise<void>
  hardDeleteDocument: (id: string) => Promise<void>
  fillSlot: (params: { slotId: string; documentId: string }) => Promise<void>
  reorderDocuments: (updates: { id: string; sort_order: number }[]) => Promise<void>
}

export function useSourceDocumentDrop({
  documentKits,
  projectId,
  workspaceId,
  invalidateDocumentKits,
  hardDeleteDocument,
  fillSlot,
  reorderDocuments,
}: UseSourceDocumentDropParams) {
  const [sourceUploadFolderId, setSourceUploadFolderId] = useState<string | null>(null)
  const [sourceUploadPhase, setSourceUploadPhase] = useState<'downloading' | 'uploading' | null>(
    null,
  )
  const [sourceUploadTargetDocId, setSourceUploadTargetDocId] = useState<string | null>(null)
  const [sourceUploadTargetPosition, setSourceUploadTargetPosition] = useState<'top' | 'bottom'>(
    'bottom',
  )

  const firstKit = documentKits[0]
  const invalidateSourceDocuments = useInvalidateSourceDocuments()

  const loadSourceDocuments = useCallback(async () => {
    await invalidateSourceDocuments(projectId)
  }, [projectId, invalidateSourceDocuments])

  const sourceUpload = useSourceDocumentUpload({
    kit: firstKit,
    allKits: documentKits,
    projectId,
    workspaceId,
    fetchDocumentKits: invalidateDocumentKits,
    loadSourceDocuments,
    hardDeleteDocument,
  })

  const handleSourceDocDrop = useCallback(
    async (
      sourceDocJson: string,
      folderId: string | null,
      targetDocId?: string,
      position?: 'top' | 'bottom',
    ) => {
      try {
        const sourceDoc: SourceDocumentInfo = JSON.parse(sourceDocJson)
        setSourceUploadFolderId(folderId)
        setSourceUploadTargetDocId(targetDocId || null)
        setSourceUploadTargetPosition(position || 'bottom')
        const newDocId = await sourceUpload.uploadSourceDocument(
          sourceDoc,
          folderId,
          true,
          setSourceUploadPhase,
        )
        setSourceUploadFolderId(null)
        setSourceUploadPhase(null)
        setSourceUploadTargetDocId(null)
        if (!newDocId) return

        if (targetDocId && position) {
          const allDocs = documentKits.flatMap((k) => k.documents || [])
          const docsInFolder = allDocs
            .filter((d) => d.folder_id === folderId && !d.is_deleted && d.id !== newDocId)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          const targetIndex = docsInFolder.findIndex((d) => d.id === targetDocId)
          const insertIndex = position === 'top' ? targetIndex : targetIndex + 1
          docsInFolder.splice(Math.max(0, insertIndex), 0, {
            id: newDocId,
          } as (typeof docsInFolder)[0])
          const updates = docsInFolder.map((doc, idx) => ({
            id: doc.id,
            sort_order: idx,
          }))
          await reorderDocuments(updates)
        }

        await invalidateDocumentKits()
      } catch {
        setSourceUploadFolderId(null)
        setSourceUploadPhase(null)
        setSourceUploadTargetDocId(null)
        toast.error('Ошибка перемещения документа из источника')
      }
    },
    [sourceUpload, invalidateDocumentKits, documentKits, reorderDocuments],
  )

  const handleSourceDocSlotDrop = useCallback(
    async (sourceDocJson: string, slotId: string, folderId: string) => {
      const toastId = toast.loading('Привязка документа к слоту...')
      try {
        const sourceDoc: SourceDocumentInfo = JSON.parse(sourceDocJson)
        const newDocId = await sourceUpload.uploadSourceDocumentForSlot(sourceDoc, folderId)
        if (newDocId) {
          await fillSlot({ slotId, documentId: newDocId })
          await invalidateDocumentKits()
          await loadSourceDocuments()
          toast.success('Документ привязан к слоту', { id: toastId })
        } else {
          toast.error('Не удалось загрузить документ', { id: toastId })
        }
      } catch {
        toast.error('Ошибка привязки документа из источника к слоту', { id: toastId })
      }
    },
    [sourceUpload, fillSlot, invalidateDocumentKits, loadSourceDocuments],
  )

  return {
    sourceUploadFolderId,
    sourceUploadPhase,
    sourceUploadTargetDocId,
    sourceUploadTargetPosition,
    sourceUpload,
    loadSourceDocuments,
    handleSourceDocDrop,
    handleSourceDocSlotDrop,
  }
}
