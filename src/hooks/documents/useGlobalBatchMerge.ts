"use client"

/**
 * Хук для операции объединения (merge) документов в глобальном batch-режиме.
 * Вынесен из useGlobalBatchActions для уменьшения размера файла.
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useDocumentKitUIStore } from '@/store/documentKitUI'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'

interface UseGlobalBatchMergeParams {
  workspaceId: string
  documentKits: DocumentKitWithDocuments[]
  globalSelectedIds: Set<string>
}

export function useGlobalBatchMerge({
  workspaceId,
  documentKits,
  globalSelectedIds,
}: UseGlobalBatchMergeParams) {
  const { openMergeDialog, setGeneratingMergeName, updateMergeName } = useDocumentKitUIStore()

  const handleMerge = useCallback(() => {
    if (globalSelectedIds.size < 2) {
      toast.warning('Выберите хотя бы 2 документа для объединения')
      return
    }

    // Определяем, из какого kit'а выбранные документы
    const kitIds = new Set<string>()
    const selectedDocsForMerge: Array<{
      id: string
      name: string
      size: number
      folderId: string | null
      created_at: string | null
    }> = []

    for (const kit of documentKits) {
      for (const doc of kit.documents ?? []) {
        if (globalSelectedIds.has(doc.id)) {
          kitIds.add(kit.id)
          const currentFile = getCurrentDocumentFile(doc.document_files)
          selectedDocsForMerge.push({
            id: doc.id,
            name: doc.name,
            size: currentFile?.file_size || 0,
            folderId: doc.folder_id,
            created_at: doc.created_at ?? null,
          })
        }
      }
    }

    if (kitIds.size > 1) {
      toast.warning(
        'Объединение документов из разных наборов не поддерживается. Выберите документы из одного набора.',
      )
      return
    }

    if (selectedDocsForMerge.length < 2) {
      toast.warning('Не найдены выбранные документы')
      return
    }

    // Сортируем по дате создания (как в useDocumentMerge)
    const sortedDocs = [...selectedDocsForMerge].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    )

    const docsList = sortedDocs.map((doc, index) => ({
      id: doc.id,
      name: doc.name,
      size: doc.size,
      order: index + 1,
    }))

    const firstDocFolderId = sortedDocs[0]?.folderId || null
    updateMergeName('')
    openMergeDialog(docsList, firstDocFolderId)

    // Генерируем имя через AI
    const documentNames = sortedDocs.map((d) => d.name).join(', ')
    setGeneratingMergeName(true)
    supabase.functions
      .invoke('generate-merge-name', {
        body: {
          workspace_id: workspaceId,
          document_names: documentNames,
          count: sortedDocs.length,
        },
      })
      .then(({ data, error }) => {
        if (error || !data?.name) {
          const fallback =
            sortedDocs.length === 2
              ? `${sortedDocs[0].name.replace(/\.[^/.]+$/, '')} и ${sortedDocs[1].name.replace(/\.[^/.]+$/, '')}.pdf`
              : `Объединённый документ (${sortedDocs.length} файлов).pdf`
          updateMergeName(fallback)
        } else {
          updateMergeName(data.name.endsWith('.pdf') ? data.name : `${data.name}.pdf`)
        }
      })
      .catch(() => {
        updateMergeName(`Объединённый документ (${sortedDocs.length} файлов).pdf`)
      })
      .finally(() => {
        setGeneratingMergeName(false)
      })
  }, [
    globalSelectedIds,
    documentKits,
    workspaceId,
    openMergeDialog,
    updateMergeName,
    setGeneratingMergeName,
  ])

  return { handleMerge }
}
