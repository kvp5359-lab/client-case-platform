"use client"

/**
 * Загрузка файлов в документы и слоты
 *
 * Управляет скрытыми file input'ами и refs для target IDs,
 * чтобы избежать stale closure при onChange.
 */

import React, { useRef, useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import { validateUploadFile } from '@/utils/files/fileValidation'

interface UseDocumentsFileUploadParams {
  documentKits: { id: string; folders?: { id: string }[] }[]
  projectId: string
  workspaceId: string
  uploadDocument: (params: {
    file: File
    documentKitId: string | null
    projectId: string
    workspaceId: string
    folderId: string | null
    skipInvalidation?: boolean
  }) => Promise<{ document: { id: string } } | undefined>
  fillSlot: (params: { slotId: string; documentId: string }) => Promise<void>
  invalidateDocumentKits: () => Promise<void>
}

export function useDocumentsFileUpload({
  documentKits,
  projectId,
  workspaceId,
  uploadDocument,
  fillSlot,
  invalidateDocumentKits,
}: UseDocumentsFileUploadParams) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const slotFileInputRef = useRef<HTMLInputElement>(null)
  // Refs для target IDs — избегаем stale closure при file input onChange
  const targetFolderIdRef = useRef<string | null>(null)
  const targetSlotIdRef = useRef<string | null>(null)
  const targetSlotFolderIdRef = useRef<string | null>(null)

  // Слот, в который сейчас идёт загрузка
  const [uploadingSlotId, setUploadingSlotId] = useState<string | null>(null)
  // Защита от повторного клика во время загрузки
  const isUploadingRef = useRef(false)

  const getKitIdByFolderId = useCallback(
    (folderId: string | null): string | undefined => {
      if (!folderId) return documentKits[0]?.id
      for (const kit of documentKits as DocumentKitWithDocuments[]) {
        if (kit.folders?.some((f) => f.id === folderId)) return kit.id
      }
      return documentKits[0]?.id
    },
    [documentKits],
  )

  const handleAddDocument = useCallback((folderId: string) => {
    if (isUploadingRef.current) return
    targetFolderIdRef.current = folderId
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files || files.length === 0) return
      if (isUploadingRef.current) return

      const folderId = targetFolderIdRef.current
      const kitId = getKitIdByFolderId(folderId)
      if (!kitId) return

      const allFiles = Array.from(files)
      const validationErrors: string[] = []
      const validFiles: File[] = []

      for (const file of allFiles) {
        const error = validateUploadFile(file)
        if (error) {
          validationErrors.push(error)
        } else {
          validFiles.push(file)
        }
      }

      if (validationErrors.length > 0) {
        toast.warning(validationErrors.join('\n'))
      }

      if (validFiles.length === 0) {
        event.target.value = ''
        targetFolderIdRef.current = null
        return
      }

      isUploadingRef.current = true
      let uploaded = 0
      try {
        for (const file of validFiles) {
          await uploadDocument({
            file,
            documentKitId: kitId,
            projectId,
            workspaceId,
            folderId: folderId || null,
          })
          uploaded++
        }
      } catch {
        toast.error(
          validFiles.length > 1
            ? `Загружено ${uploaded} из ${validFiles.length} файлов`
            : 'Ошибка при загрузке файла',
        )
      } finally {
        isUploadingRef.current = false
        event.target.value = ''
        targetFolderIdRef.current = null
      }
    },
    [getKitIdByFolderId, uploadDocument, projectId, workspaceId],
  )

  const handleSlotClick = useCallback((slotId: string, folderId: string) => {
    targetSlotIdRef.current = slotId
    targetSlotFolderIdRef.current = folderId
    slotFileInputRef.current?.click()
  }, [])

  const handleSlotFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      const slotId = targetSlotIdRef.current
      const slotFolderId = targetSlotFolderIdRef.current
      if (!file || !slotId || !slotFolderId) return

      const validationError = validateUploadFile(file)
      if (validationError) {
        toast.warning(validationError)
        event.target.value = ''
        return
      }

      const kitId = getKitIdByFolderId(slotFolderId)
      if (!kitId) return

      setUploadingSlotId(slotId)

      try {
        // Загружаем без инвалидации кэша — чтобы документ не появился отдельно
        const result = await uploadDocument({
          file,
          documentKitId: kitId,
          projectId,
          workspaceId,
          folderId: slotFolderId,
          skipInvalidation: true,
        })
        if (result?.document?.id) {
          await fillSlot({ slotId, documentId: result.document.id })
        }
        // Одна инвалидация после полного завершения (upload + fillSlot)
        await invalidateDocumentKits()
      } catch {
        toast.error('Ошибка при загрузке файла в слот')
      } finally {
        setUploadingSlotId(null)
        event.target.value = ''
        targetSlotIdRef.current = null
        targetSlotFolderIdRef.current = null
      }
    },
    [getKitIdByFolderId, uploadDocument, projectId, workspaceId, fillSlot, invalidateDocumentKits],
  )

  return {
    fileInputRef,
    slotFileInputRef,
    handleAddDocument,
    handleFileChange,
    handleSlotClick,
    handleSlotFileChange,
    uploadingSlotId,
  }
}
