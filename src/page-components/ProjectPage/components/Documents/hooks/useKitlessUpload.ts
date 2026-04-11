"use client"

/**
 * Хук для загрузки документов без набора (kit-less upload)
 */

import { useCallback, useRef, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { kitlessDocumentKeys } from '@/hooks/queryKeys'
import type { UploadDocumentFn } from '@/hooks/useDocuments.types'

interface UseKitlessUploadParams {
  projectId: string
  workspaceId: string
  uploadDocument: UploadDocumentFn
}

export function useKitlessUpload({
  projectId,
  workspaceId,
  uploadDocument,
}: UseKitlessUploadParams) {
  const queryClient = useQueryClient()
  const kitlessFileInputRef = useRef<HTMLInputElement>(null)
  const isKitlessUploadingRef = useRef(false)

  const handleKitlessDocument = useCallback(() => {
    if (isKitlessUploadingRef.current) return
    kitlessFileInputRef.current?.click()
  }, [])

  const handleKitlessFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files || files.length === 0) return
      if (isKitlessUploadingRef.current) return

      const validFiles = Array.from(files).filter((f) => {
        if (f.size > 50 * 1024 * 1024) {
          toast.warning(`${f.name}: размер превышает лимит 50 МБ`)
          return false
        }
        return true
      })

      if (validFiles.length === 0) {
        event.target.value = ''
        return
      }

      isKitlessUploadingRef.current = true
      let uploaded = 0
      try {
        for (const file of validFiles) {
          await uploadDocument({
            file,
            documentKitId: null,
            projectId,
            workspaceId,
            folderId: null,
          })
          uploaded++
        }
        queryClient.invalidateQueries({ queryKey: kitlessDocumentKeys.byProject(projectId) })
        toast.success(validFiles.length > 1 ? `Загружено ${uploaded} файл(ов)` : 'Файл загружен')
      } catch {
        toast.error(
          validFiles.length > 1
            ? `Загружено ${uploaded} из ${validFiles.length} файлов`
            : 'Ошибка при загрузке файла',
        )
      } finally {
        isKitlessUploadingRef.current = false
        event.target.value = ''
      }
    },
    [uploadDocument, projectId, workspaceId, queryClient],
  )

  return {
    kitlessFileInputRef,
    handleKitlessDocument,
    handleKitlessFileChange,
  }
}
