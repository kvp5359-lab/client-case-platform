"use client"

/**
 * Хук для drag & drop вложений из мессенджера в документы
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { triggerTextExtraction } from '@/services/documents/textExtractionService'
import type { DocumentKitWithDocuments } from '@/components/documents/types'

interface UseMessengerAttachmentDropParams {
  documentKits: DocumentKitWithDocuments[]
  projectId: string
  workspaceId: string
  invalidateDocumentKits: () => Promise<void>
  fillSlot: (params: { slotId: string; documentId: string }) => Promise<void>
  reorderDocuments: (updates: { id: string; sort_order: number }[]) => Promise<void>
}

export function useMessengerAttachmentDrop({
  documentKits,
  projectId,
  workspaceId,
  invalidateDocumentKits,
  fillSlot,
  reorderDocuments,
}: UseMessengerAttachmentDropParams) {
  const createDocFromAttachment = useCallback(
    async (attachmentJson: string, folderId: string) => {
      const attachment = JSON.parse(attachmentJson) as {
        file_id: string | null
        file_name: string
        storage_path: string
        file_size: number | null
        mime_type: string | null
      }
      const kitId = documentKits.find((k) => k.folders?.some((f) => f.id === folderId))?.id
      if (!kitId) throw new Error('Набор документов не найден')
      const { data: newDoc, error: docError } = await supabase
        .from('documents')
        .insert({
          name: attachment.file_name.replace(/\.[^/.]+$/, ''),
          document_kit_id: kitId,
          folder_id: folderId,
          project_id: projectId,
          workspace_id: workspaceId,
          status: null,
        })
        .select()
        .single()
      if (docError || !newDoc) throw new Error(docError?.message || 'Ошибка создания документа')

      const { error: dfError } = await supabase.from('document_files').insert({
        document_id: newDoc.id,
        workspace_id: workspaceId,
        file_path: attachment.storage_path,
        file_name: attachment.file_name,
        file_size: attachment.file_size || 0,
        mime_type: attachment.mime_type || 'application/octet-stream',
        is_current: true,
        file_id: attachment.file_id || null,
      })
      if (dfError) {
        await supabase.from('documents').delete().eq('id', newDoc.id)
        throw new Error(dfError.message)
      }

      // Fire-and-forget: после OCR обновим кэш, чтобы text_content стал доступен
      triggerTextExtraction(newDoc.id).then((extracted) => {
        if (extracted) invalidateDocumentKits()
      })
      return newDoc
    },
    [projectId, workspaceId, documentKits, invalidateDocumentKits],
  )

  const handleMessengerAttachmentDrop = useCallback(
    async (
      attachmentJson: string,
      folderId: string | null,
      targetDocId?: string,
      position?: 'top' | 'bottom',
    ) => {
      if (!projectId || !workspaceId || !folderId) return
      try {
        const newDoc = await createDocFromAttachment(attachmentJson, folderId)

        if (targetDocId && position) {
          const allDocs = documentKits.flatMap((k) => k.documents || [])
          const docsInFolder = allDocs
            .filter((d) => d.folder_id === folderId && !d.is_deleted && d.id !== newDoc.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          const targetIndex = docsInFolder.findIndex((d) => d.id === targetDocId)
          const insertIndex = position === 'top' ? targetIndex : targetIndex + 1
          docsInFolder.splice(Math.max(0, insertIndex), 0, {
            id: newDoc.id,
          } as (typeof docsInFolder)[0])
          const updates = docsInFolder.map((doc, idx) => ({ id: doc.id, sort_order: idx }))
          await reorderDocuments(updates)
        }

        await invalidateDocumentKits()
        toast.success('Документ добавлен в проект')
      } catch {
        toast.error('Ошибка добавления документа из чата')
      }
    },
    [
      projectId,
      workspaceId,
      documentKits,
      createDocFromAttachment,
      reorderDocuments,
      invalidateDocumentKits,
    ],
  )

  const handleMessengerAttachmentSlotDrop = useCallback(
    async (attachmentJson: string, slotId: string, folderId: string) => {
      if (!projectId || !workspaceId) return
      const toastId = toast.loading('Привязка документа к слоту...')
      try {
        const newDoc = await createDocFromAttachment(attachmentJson, folderId)
        await fillSlot({ slotId, documentId: newDoc.id })
        await invalidateDocumentKits()
        toast.success('Документ привязан к слоту', { id: toastId })
      } catch {
        toast.error('Ошибка привязки документа из чата к слоту', { id: toastId })
      }
    },
    [projectId, workspaceId, createDocFromAttachment, fillSlot, invalidateDocumentKits],
  )

  return {
    handleMessengerAttachmentDrop,
    handleMessengerAttachmentSlotDrop,
  }
}
