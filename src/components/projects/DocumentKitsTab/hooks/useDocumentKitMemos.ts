"use client"

/**
 * useDocumentKitMemos — мемоизированные производные данные для DocumentKitsTab.
 * Выделено из useDocumentKitSetup для уменьшения размера файла.
 */

import { useMemo } from 'react'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'

export function useDocumentKitMemos(
  documentKits: DocumentKitWithDocuments[],
  kitId: string | null,
  showOnlyUnverified: boolean,
) {
  const kit = documentKits.find((k) => k.id === kitId)

  // Мемоизируем folders чтобы не триггерить useEffect'ы при каждом рендере
  const folders = useMemo(() => kit?.folders || [], [kit?.folders])

  // Все папки из всех наборов — для batch move (перемещение из источника)
  const allFolders = useMemo(
    () => documentKits.flatMap((k) => k.folders || []),
    [documentKits],
  )

  // Карта имён документов текущего kit — для BatchCheckDialog
  const documentNamesMap = useMemo(
    () => new Map(kit?.documents?.map((doc) => [doc.id, doc.name]) || []),
    [kit?.documents],
  )

  // Список документов для выбора (с учётом фильтра "только непроверенные")
  const allFilteredDocuments = useMemo(() => {
    const allVisibleDocuments = kit?.documents?.filter((d) => !d.is_deleted) || []
    return showOnlyUnverified
      ? allVisibleDocuments.filter((d) => d.ai_check_result === null)
      : allVisibleDocuments
  }, [kit?.documents, showOnlyUnverified])

  return { kit, folders, allFolders, documentNamesMap, allFilteredDocuments }
}
