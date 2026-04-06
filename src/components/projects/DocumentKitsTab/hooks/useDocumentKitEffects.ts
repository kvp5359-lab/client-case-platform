"use client"

/**
 * useDocumentKitEffects — side-effects и мемоизированные вычисления для DocumentKitsTab.
 *
 * Извлечён из useDocumentKitSetup для снижения размера файла.
 * Логика не менялась — только перемещены useEffect и useDocumentMemos вызовы.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { getArticleById } from '@/services/api/knowledge/knowledgeBaseService'
import { useFolderNamesCache } from './useFolderNamesCache'
import { useDocumentMemos } from './useDocumentMemos'
import type {
  DocumentKitWithDocuments,
  DocumentWithFiles,
  Folder,
  FolderSlotWithDocument,
} from '@/components/documents/types'

interface UseDocumentKitEffectsParams {
  // For knowledge base prefetch
  folders: Folder[]

  // For template load effect
  templateSelectDialogOpen: boolean
  loadFolderTemplates: (kit: DocumentKitWithDocuments | undefined) => void
  kit: DocumentKitWithDocuments | undefined

  // For useFolderNamesCache
  sourceFolderId: string | null | undefined
  exportFolderId: string | null | undefined
  setSourceConnected: (v: boolean) => void
  setSourceFolderName: (v: string) => void
  setExportFolderConnected: (v: boolean) => void
  setExportFolderName: (v: string) => void

  // For useDocumentMemos
  allKits: DocumentKitWithDocuments[]
  showOnlyUnverified: boolean
  folderSlots: FolderSlotWithDocument[]
  selectedDocuments: Set<string>
  kitlessDocuments: DocumentWithFiles[]
}

export function useDocumentKitEffects({
  folders,
  templateSelectDialogOpen,
  loadFolderTemplates,
  kit,
  sourceFolderId,
  exportFolderId,
  setSourceConnected,
  setSourceFolderName,
  setExportFolderConnected,
  setExportFolderName,
  allKits,
  showOnlyUnverified,
  folderSlots,
  selectedDocuments,
  kitlessDocuments,
}: UseDocumentKitEffectsParams) {
  const queryClient = useQueryClient()

  // Prefetch статей базы знаний для всех папок одним батчем
  // Вместо N отдельных useQuery в каждом FolderSection — кладём в кэш заранее
  useEffect(() => {
    const articleIds = folders.map((f) => f.knowledge_article_id).filter((id): id is string => !!id)

    const uniqueIds = [...new Set(articleIds)]
    for (const id of uniqueIds) {
      queryClient.prefetchQuery({
        queryKey: knowledgeBaseKeys.article(id),
        queryFn: () => getArticleById(id),
      })
    }
  }, [folders, queryClient])

  useEffect(() => {
    if (templateSelectDialogOpen) loadFolderTemplates(kit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateSelectDialogOpen])

  useFolderNamesCache({
    sourceFolderId,
    exportFolderId,
    setSourceConnected,
    setSourceFolderName,
    setExportFolderConnected,
    setExportFolderName,
    // TODO(blocked): требует настройки Google OAuth credentials
    getFolderName: async () => null,
  })

  // === МЕМОИЗИРОВАННЫЕ ВЫЧИСЛЕНИЯ ===
  const memos = useDocumentMemos({
    kit,
    allKits,
    showOnlyUnverified,
    folderSlots,
    selectedDocuments,
    folders,
    extraUngroupedDocs: kitlessDocuments,
  })

  return memos
}
