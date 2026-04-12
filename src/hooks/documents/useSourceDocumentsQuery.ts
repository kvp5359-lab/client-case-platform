"use client"

/**
 * React Query хук для source documents (Google Drive папка-источник).
 *
 * Заменяет ручное хранение sourceDocuments в Zustand store.
 * Данные кэшируются React Query, инвалидируются после мутаций.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getSourceDocumentsByProject } from '@/services/documents/sourceDocumentService'
import { googleDriveKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { SourceDocument } from '@/components/documents/types'

interface SourceDocumentsResult {
  documents: SourceDocument[]
  usedSourceIds: Set<string>
}

/**
 * Загружает raw данные из БД и трансформирует в SourceDocument[].
 * Фильтрация hidden/used происходит позже — в `select`.
 */
async function fetchSourceDocuments(projectId: string): Promise<SourceDocumentsResult> {
  const { documents: sourceDocs, usedSourceIds } =
    await getSourceDocumentsByProject(projectId)

  const availableDocs = sourceDocs.filter((doc) => !usedSourceIds.has(doc.id))

  const formattedDocs: SourceDocument[] = availableDocs.map((doc) => ({
    id: doc.google_drive_file_id,
    name: doc.name,
    mimeType: doc.mime_type || '',
    size: doc.file_size || undefined,
    createdTime: doc.created_time || undefined,
    modifiedTime: doc.modified_time || undefined,
    webViewLink: doc.web_view_link || undefined,
    iconLink: doc.icon_link || undefined,
    parentFolderName: doc.parent_folder_name || undefined,
    sourceDocumentId: doc.id,
    isHidden: doc.is_hidden || undefined,
  }))

  return { documents: formattedDocs, usedSourceIds }
}

/**
 * React Query хук: загружает source documents для проекта.
 *
 * @param projectId - ID проекта
 * @param showHidden - показывать скрытые документы (фильтрация через `select`)
 */
export function useSourceDocumentsQuery(projectId: string | undefined, showHidden = false) {
  return useQuery({
    queryKey: googleDriveKeys.sourceDocuments(projectId ?? ''),
    queryFn: () => fetchSourceDocuments(projectId!),
    enabled: !!projectId,
    staleTime: STALE_TIME.MEDIUM,
    select: (result) => {
      if (showHidden) return result.documents
      return result.documents.filter((doc) => !doc.isHidden)
    },
  })
}

/**
 * Хелпер: возвращает функцию для инвалидации кэша source documents.
 * Вызывать после мутаций (toggle hidden, sync, upload source doc).
 */
export function useInvalidateSourceDocuments() {
  const queryClient = useQueryClient()
  return useCallback(
    (projectId: string) =>
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.sourceDocuments(projectId),
      }),
    [queryClient],
  )
}
