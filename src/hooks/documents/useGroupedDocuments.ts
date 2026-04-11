"use client"

/**
 * Хук для группировки документов по папкам
 * Выносит бизнес-логику из DocumentKitsTab
 */

import { useMemo } from 'react'
import { isStatusUnselected, type DocumentWithFiles } from '@/components/documents/types'

interface UseGroupedDocumentsProps {
  documents: DocumentWithFiles[] | undefined
  showOnlyUnverified: boolean
  /** ID документов, привязанных к слотам — они не попадают в обычный список */
  slotDocumentIds?: Set<string>
}

interface UseGroupedDocumentsReturn {
  documentsByFolder: Map<string, DocumentWithFiles[]>
  ungroupedDocuments: DocumentWithFiles[]
  trashedDocuments: DocumentWithFiles[]
  allFilteredDocuments: DocumentWithFiles[]
}

export function useGroupedDocuments({
  documents,
  showOnlyUnverified,
  slotDocumentIds,
}: UseGroupedDocumentsProps): UseGroupedDocumentsReturn {
  return useMemo(() => {
    const allDocs = documents || []

    // Отделяем удалённые документы
    const trashedDocuments = allDocs.filter((d) => d.is_deleted === true)
    const visibleDocuments = allDocs.filter((d) => d.is_deleted !== true)

    // Унифицирован фильтр — используем isStatusUnselected как в documentsByFolder
    const allFilteredDocuments = showOnlyUnverified
      ? visibleDocuments.filter((d) => isStatusUnselected(d.status))
      : visibleDocuments

    // Группируем документы по папкам
    const documentsByFolder = new Map<string, DocumentWithFiles[]>()

    visibleDocuments.forEach((doc) => {
      if (doc.folder_id) {
        // Пропускаем документы, привязанные к слотам — они отображаются в слотах
        if (slotDocumentIds?.has(doc.id)) return

        // Фильтр "только непроверенные"
        if (showOnlyUnverified && !isStatusUnselected(doc.status)) {
          return // Пропускаем документы с выбранным статусом
        }

        const existing = documentsByFolder.get(doc.folder_id) || []
        documentsByFolder.set(doc.folder_id, [...existing, doc])
      }
    })

    // Сортируем документы в папках по sort_order
    documentsByFolder.forEach((docs, folderId) => {
      documentsByFolder.set(
        folderId,
        [...docs].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      )
    })

    // Нераспределённые документы
    let ungroupedDocuments = visibleDocuments
      .filter((d) => !d.folder_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    if (showOnlyUnverified) {
      ungroupedDocuments = ungroupedDocuments.filter((d) => isStatusUnselected(d.status))
    }

    return {
      documentsByFolder,
      ungroupedDocuments,
      trashedDocuments,
      allFilteredDocuments,
    }
  }, [documents, showOnlyUnverified, slotDocumentIds])
}
