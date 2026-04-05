"use client"

/**
 * useDocumentsFlatList — два мемоизированных списка документов для DocumentsTabContent:
 * - allUngroupedDocuments: все документы без папки (из kits + kitless, с дедупликацией)
 * - allDocumentsFlat: плоский список всех документов в порядке, как они отображаются
 *   (нужен для Shift-click selection)
 *
 * Выделено из DocumentsTabContent.tsx для уменьшения размера файла.
 */

import { useMemo } from 'react'
import type { DocumentKitWithDocuments, FolderSlotWithDocument } from '@/components/documents/types'

interface KitlessDocument {
  id: string
  folder_id: string | null
  is_deleted: boolean
  sort_order: number | null
}

export function useDocumentsFlatList(
  documentKits: DocumentKitWithDocuments[],
  kitlessDocuments: KitlessDocument[],
  folderSlots: FolderSlotWithDocument[],
) {
  // Все документы без папки (для ungrouped секции), с дедупликацией
  const allUngroupedDocuments = useMemo(() => {
    const fromKits = documentKits.flatMap((kit) =>
      (kit.documents || []).filter((d) => !d.folder_id && !d.is_deleted),
    )
    const seen = new Set<string>()
    return [...fromKits, ...kitlessDocuments]
      .filter((d) => {
        if (seen.has(d.id)) return false
        seen.add(d.id)
        return true
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [documentKits, kitlessDocuments])

  // Плоский список всех документов в UI-порядке — для Shift-click выделения диапазона
  const allDocumentsFlat = useMemo(() => {
    const result: { id: string }[] = []
    for (const kit of documentKits) {
      const folders = kit.folders || []
      const documents = kit.documents || []
      const kitFolderIds = new Set(folders.map((f) => f.id))
      const kitSlots = folderSlots.filter((s) => kitFolderIds.has(s.folder_id))
      const slotDocIds = new Set(kitSlots.filter((s) => s.document_id).map((s) => s.document_id!))
      for (const folder of folders) {
        const folderDocs = documents
          .filter((d) => d.folder_id === folder.id && !d.is_deleted && !slotDocIds.has(d.id))
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        for (const doc of folderDocs) result.push(doc)
        const folderFilledSlots = kitSlots
          .filter((s) => s.folder_id === folder.id && s.document_id && s.document)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        for (const slot of folderFilledSlots) result.push(slot.document!)
      }
      const ungrouped = documents
        .filter((d) => !d.folder_id && !d.is_deleted)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      for (const doc of ungrouped) result.push(doc)
    }
    return result
  }, [documentKits, folderSlots])

  return { allUngroupedDocuments, allDocumentsFlat }
}
