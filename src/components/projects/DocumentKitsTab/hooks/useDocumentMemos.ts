"use client"

/**
 * Хук для мемоизированных вычислений над документами.
 * Группировка по папкам, фильтрация, корзина.
 */

import { useMemo } from 'react'
import type {
  DocumentKitWithDocuments,
  DocumentWithFiles,
  FolderSlotWithDocument,
} from '@/components/documents/types'
import { isStatusUnselected } from '@/components/documents/types'

interface UseDocumentMemosParams {
  kit: DocumentKitWithDocuments | undefined
  allKits?: DocumentKitWithDocuments[]
  showOnlyUnverified: boolean
  folderSlots: FolderSlotWithDocument[]
  selectedDocuments: Set<string>
  /** Папки текущего набора — для формирования orderedDocumentList */
  folders: { id: string }[]
  /** Документы без набора (document_kit_id IS NULL) — добавляются в ungroupedDocuments */
  extraUngroupedDocs?: DocumentWithFiles[]
}

interface UseDocumentMemosReturn {
  slotDocumentIds: Set<string>
  documentsByFolder: Map<string, DocumentWithFiles[]>
  ungroupedDocuments: DocumentWithFiles[]
  trashedDocuments: DocumentWithFiles[]
  hasTrashDocumentsSelected: boolean
  /** Плоский список документов в порядке отображения (папки → нераспределённые) для Shift-выделения */
  orderedDocumentList: DocumentWithFiles[]
}

export function useDocumentMemos({
  kit,
  allKits,
  showOnlyUnverified,
  folderSlots,
  selectedDocuments,
  folders,
  extraUngroupedDocs,
}: UseDocumentMemosParams): UseDocumentMemosReturn {
  // ID документов, привязанных к слотам — они не попадают в обычный список
  const slotDocumentIds = useMemo(() => {
    const ids = new Set<string>()
    folderSlots.forEach((s) => {
      if (s.document_id) ids.add(s.document_id)
    })
    return ids
  }, [folderSlots])

  // Группировка документов (мемоизировано для оптимизации)
  const documentsByFolder = useMemo(() => {
    if (!kit) return new Map<string, DocumentWithFiles[]>()

    const map = new Map<string, DocumentWithFiles[]>()
    kit.documents?.forEach((doc) => {
      if (doc.folder_id && !doc.is_deleted) {
        // Z3-58: skip documents assigned to slots — they render in SlotRow, not in folder list
        if (slotDocumentIds.has(doc.id)) return
        // Фильтр "только непроверенные": скрываем документы с установленным статусом
        if (showOnlyUnverified && !isStatusUnselected(doc.status)) return
        const existing = map.get(doc.folder_id) || []
        map.set(doc.folder_id, [...existing, doc])
      }
    })
    map.forEach((docs, folderId) => {
      if (docs)
        map.set(
          folderId,
          docs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
        )
    })
    return map
  }, [kit, showOnlyUnverified, slotDocumentIds])

  // Если передан allKits — агрегируем ungrouped/trash по ВСЕМ наборам (project-level)
  const kitsForAggregation = useMemo(() => allKits ?? (kit ? [kit] : []), [allKits, kit])

  const ungroupedDocuments = useMemo(() => {
    const allDocs: DocumentWithFiles[] = []
    for (const k of kitsForAggregation) {
      const docs = k.documents?.filter((d) => !d.folder_id && !d.is_deleted) || []
      allDocs.push(...docs)
    }
    // Добавляем документы без набора (document_kit_id IS NULL)
    if (extraUngroupedDocs) allDocs.push(...extraUngroupedDocs)
    // Дедупликация по id (документ может быть в kit с folder_id=null И в kitless)
    const seen = new Set<string>()
    const unique = allDocs.filter((d) => {
      if (seen.has(d.id)) return false
      seen.add(d.id)
      return true
    })
    let sorted = unique.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    if (showOnlyUnverified) sorted = sorted.filter((d) => isStatusUnselected(d.status))
    return sorted
  }, [kitsForAggregation, showOnlyUnverified, extraUngroupedDocs])

  const trashedDocuments = useMemo(() => {
    const allDocs: DocumentWithFiles[] = []
    for (const k of kitsForAggregation) {
      const docs = k.documents?.filter((d) => d.is_deleted) || []
      allDocs.push(...docs)
    }
    return allDocs
  }, [kitsForAggregation])

  // Проверяем, есть ли среди выбранных документов те, что в корзине
  const hasTrashDocumentsSelected = useMemo(() => {
    if (selectedDocuments.size === 0) return false
    const selectedIds = Array.from(selectedDocuments)
    return trashedDocuments.some((doc) => selectedIds.includes(doc.id))
  }, [selectedDocuments, trashedDocuments])

  // Плоский список документов в порядке отображения — для Shift-выделения через папки
  const orderedDocumentList = useMemo(() => {
    const result: DocumentWithFiles[] = []
    // Документы по папкам в порядке отображения
    for (const folder of folders) {
      const docs = documentsByFolder.get(folder.id)
      if (docs) result.push(...docs)
      // Документы из слотов этой папки
      const slotDocs = folderSlots
        .filter((s) => s.folder_id === folder.id && s.document_id && s.document)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((s) => s.document!)
      result.push(...slotDocs)
    }
    // Нераспределённые документы в конце
    result.push(...ungroupedDocuments)
    return result
  }, [folders, documentsByFolder, folderSlots, ungroupedDocuments])

  return {
    slotDocumentIds,
    documentsByFolder,
    ungroupedDocuments,
    trashedDocuments,
    hasTrashDocumentsSelected,
    orderedDocumentList,
  }
}
