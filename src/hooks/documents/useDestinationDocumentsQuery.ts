"use client"

/**
 * React Query хук для destination documents (Google Drive папка назначения).
 *
 * Заменяет ручное хранение destinationDocuments в Zustand store.
 * Загрузка происходит только по запросу (refetch), не автоматически.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { listFiles } from '@/services/api/googleDriveService'
import { googleDriveKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { DestinationDocument } from '@/components/documents/types'

async function fetchDestinationDocuments(
  exportFolderId: string,
  workspaceId: string,
): Promise<DestinationDocument[]> {
  const files = await listFiles(exportFolderId, workspaceId)

  const destinationDocs: DestinationDocument[] = files.map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? parseInt(file.size) : undefined,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    iconLink: file.iconLink,
    parentFolderName: file.parentFolderName,
  }))

  destinationDocs.sort((a, b) => {
    const folderA = a.parentFolderName || ''
    const folderB = b.parentFolderName || ''

    if (folderA !== folderB) {
      return folderA.localeCompare(folderB, 'ru')
    }

    return a.name.localeCompare(b.name, 'ru')
  })

  return destinationDocs
}

/**
 * React Query хук: загружает destination documents для Google Drive папки.
 *
 * enabled: false — данные загружаются только при вызове refetch().
 * Это сохраняет текущее поведение: пользователь нажимает кнопку «Показать состав».
 */
export function useDestinationDocumentsQuery(
  exportFolderId: string | null | undefined,
  workspaceId: string,
) {
  return useQuery({
    queryKey: googleDriveKeys.destinationDocuments(exportFolderId ?? '', workspaceId),
    queryFn: () => fetchDestinationDocuments(exportFolderId!, workspaceId),
    enabled: false,
    staleTime: STALE_TIME.MEDIUM,
  })
}

/**
 * Хелпер: инвалидация кэша destination documents.
 */
export function useInvalidateDestinationDocuments() {
  const queryClient = useQueryClient()
  return useCallback(
    (exportFolderId: string, workspaceId: string) =>
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.destinationDocuments(exportFolderId, workspaceId),
      }),
    [queryClient],
  )
}
