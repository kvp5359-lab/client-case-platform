"use client"

/**
 * Хук для drag & drop документов между папками.
 * Управляет drag state + логика перемещения (реордеринг и cross-kit move).
 * Повторяет поведение старой вкладки DocumentKitsTab.
 */

import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { getKitIdForFolder } from '@/services/documents/documentKitUtils'
import { documentKitKeys } from '@/hooks/queryKeys'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { DocumentWithFiles } from '@/components/documents/types'

type DragOverPosition = 'top' | 'bottom'

interface UseDocumentsDragDropProps {
  documentKits: DocumentKitWithDocuments[]
  projectId: string
  reorderDocuments: (
    updates: {
      id: string
      sort_order: number
      folder_id?: string | null
      document_kit_id?: string
    }[],
  ) => Promise<void>
  invalidateDocumentKits: () => Promise<void>
}

export function useDocumentsDragDrop({
  documentKits,
  projectId,
  reorderDocuments,
  invalidateDocumentKits,
}: UseDocumentsDragDropProps) {
  const queryClient = useQueryClient()
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null)
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<DragOverPosition>('bottom')
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // Guard от параллельных операций
  const isDragMovingRef = useRef(false)

  /**
   * Optimistic update кэша: перемещает документ между папками/наборами мгновенно.
   * Возвращает предыдущий snapshot для отката при ошибке.
   */
  const applyOptimisticMove = useCallback(
    (
      docId: string,
      updates: Array<{
        id: string
        sort_order: number
        folder_id?: string | null
        document_kit_id?: string
      }>,
    ): DocumentKitWithDocuments[] | undefined => {
      const qk = documentKitKeys.byProject(projectId)
      const previous = queryClient.getQueryData<DocumentKitWithDocuments[]>(qk)
      if (!previous) return undefined

      // Собираем map обновлений: id → { sort_order, folder_id?, document_kit_id? }
      const updateMap = new Map(updates.map((u) => [u.id, u]))
      const movedUpdate = updateMap.get(docId)
      const newFolderId = movedUpdate?.folder_id
      const newKitId = movedUpdate?.document_kit_id

      queryClient.setQueryData<DocumentKitWithDocuments[]>(qk, (old) => {
        if (!old) return old
        return old.map((kit) => {
          const docs = kit.documents ?? []
          // Если документ переходит в другой набор — убираем из текущего
          if (newKitId && newKitId !== kit.id) {
            const filtered = docs.filter((d) => d.id !== docId)
            if (filtered.length !== docs.length) {
              return {
                ...kit,
                documents: filtered.map((d) => {
                  const u = updateMap.get(d.id)
                  return u ? { ...d, sort_order: u.sort_order } : d
                }),
              }
            }
          }
          // Обновляем sort_order и folder_id для документов в этом наборе
          let updatedDocs = docs.map((d) => {
            const u = updateMap.get(d.id)
            if (!u) return d
            return {
              ...d,
              sort_order: u.sort_order,
              ...(u.folder_id !== undefined && { folder_id: u.folder_id }),
              ...(u.document_kit_id && { document_kit_id: u.document_kit_id }),
            }
          })
          // Если документ приходит из другого набора — добавляем
          if (newKitId === kit.id && !docs.some((d) => d.id === docId)) {
            const allDocs = previous.flatMap((k) => k.documents ?? [])
            const movedDoc = allDocs.find((d) => d.id === docId)
            if (movedDoc) {
              updatedDocs = [
                ...updatedDocs,
                {
                  ...movedDoc,
                  sort_order: movedUpdate!.sort_order,
                  folder_id: newFolderId ?? movedDoc.folder_id,
                  document_kit_id: newKitId,
                },
              ]
            }
          }
          return { ...kit, documents: updatedDocs }
        })
      })

      return previous
    },
    [projectId, queryClient],
  )

  const resetDragState = useCallback(() => {
    setDraggedDocId(null)
    setDragOverDocId(null)
    setDragOverFolderId(null)
  }, [])

  // --- Drag handlers для DocumentItem ---

  const onDocDragStart = useCallback((e: React.DragEvent, docId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-document-id', docId)
    setDraggedDocId(docId)
  }, [])

  const onDocDragOver = useCallback((e: React.DragEvent, targetDocId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position: DragOverPosition = e.clientY < midY ? 'top' : 'bottom'
    setDragOverDocId(targetDocId)
    setDragOverPosition(position)
  }, [])

  const onDocDragLeave = useCallback(() => {
    setDragOverDocId(null)
  }, [])

  const onDocDragEnd = useCallback(() => {
    resetDragState()
  }, [resetDragState])

  // --- Drop на документ (реордеринг + cross-folder/cross-kit) ---

  const onDocDrop = useCallback(
    async (e: React.DragEvent, targetDoc: DocumentWithFiles) => {
      // Source doc drop — обрабатывается в DocumentItem.handleDrop напрямую
      if (e.dataTransfer.getData('application/x-source-doc') === 'true') {
        setDragOverDocId(null)
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const docId = draggedDocId || e.dataTransfer.getData('application/x-document-id') || null
      if (!docId || docId === targetDoc.id || isDragMovingRef.current) {
        resetDragState()
        return
      }

      const allDocs = documentKits.flatMap((k) => k.documents || [])
      const draggedDoc = allDocs.find((d) => d.id === docId)
      if (!draggedDoc) {
        resetDragState()
        return
      }

      isDragMovingRef.current = true

      const targetFolderId = targetDoc.folder_id
      const docsInTargetFolder = allDocs
        .filter((d) => d.folder_id === targetFolderId && !d.is_deleted)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      const filteredDocs = docsInTargetFolder.filter((d) => d.id !== docId)
      const targetIndex = filteredDocs.findIndex((d) => d.id === targetDoc.id)

      const insertIndex = dragOverPosition === 'top' ? targetIndex : targetIndex + 1
      filteredDocs.splice(insertIndex, 0, draggedDoc)

      const targetKitId = getKitIdForFolder(targetFolderId, documentKits)

      const updates = filteredDocs.map((doc, idx) => ({
        id: doc.id,
        sort_order: idx,
        ...(doc.id === docId &&
          draggedDoc.folder_id !== targetFolderId && {
            folder_id: targetFolderId,
            ...(targetKitId && { document_kit_id: targetKitId }),
          }),
      }))
      // Optimistic update — мгновенно перемещаем документ в UI
      const previousData = applyOptimisticMove(docId, updates)

      resetDragState()

      try {
        await reorderDocuments(updates)
        await invalidateDocumentKits()
      } catch (error) {
        logger.error('Ошибка перемещения документа drag & drop:', error)
        // Откатываем optimistic update при ошибке
        if (previousData) {
          queryClient.setQueryData(documentKitKeys.byProject(projectId), previousData)
        }
        toast.error('Ошибка перемещения документа')
      } finally {
        isDragMovingRef.current = false
      }
    },
    [
      draggedDocId,
      dragOverPosition,
      documentKits,
      reorderDocuments,
      invalidateDocumentKits,
      resetDragState,
      applyOptimisticMove,
      queryClient,
      projectId,
    ],
  )

  // --- Drop на папку (перемещение в конец) ---

  const onFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    // Только для обычных документов (не source docs)
    if (e.dataTransfer.types.includes('application/x-source-doc')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }, [])

  const onFolderDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverFolderId(null)
    }
  }, [])

  const onFolderDrop = useCallback(
    async (e: React.DragEvent, targetFolderId: string) => {
      e.preventDefault()
      e.stopPropagation()

      // Не обрабатываем source docs здесь — они обрабатываются через handleSourceDrop
      if (e.dataTransfer.getData('application/x-source-doc') === 'true') {
        setDragOverFolderId(null)
        return
      }

      const docId = draggedDocId || e.dataTransfer.getData('application/x-document-id') || null
      if (!docId || isDragMovingRef.current) {
        resetDragState()
        return
      }

      const allDocs = documentKits.flatMap((k) => k.documents || [])
      const draggedDoc = allDocs.find((d) => d.id === docId)
      if (!draggedDoc) {
        resetDragState()
        return
      }

      // Drop на ту же папку — пропускаем
      if (draggedDoc.folder_id === targetFolderId) {
        resetDragState()
        return
      }

      isDragMovingRef.current = true

      const docsInTargetFolder = allDocs.filter(
        (d) => d.folder_id === targetFolderId && !d.is_deleted,
      )
      const maxOrder =
        docsInTargetFolder.length > 0
          ? Math.max(...docsInTargetFolder.map((d) => d.sort_order || 0))
          : -1

      const targetKitId = getKitIdForFolder(targetFolderId, documentKits)

      const updates = [
        {
          id: docId,
          sort_order: maxOrder + 1,
          folder_id: targetFolderId,
          ...(targetKitId && { document_kit_id: targetKitId }),
        },
      ]

      // Optimistic update — мгновенно перемещаем документ в UI
      const previousData = applyOptimisticMove(docId, updates)

      resetDragState()

      try {
        await reorderDocuments(updates)
        await invalidateDocumentKits()
      } catch (error) {
        logger.error('Ошибка перемещения документа в папку:', error)
        // Откатываем optimistic update при ошибке
        if (previousData) {
          queryClient.setQueryData(documentKitKeys.byProject(projectId), previousData)
        }
        toast.error('Ошибка перемещения документа')
      } finally {
        isDragMovingRef.current = false
      }
    },
    [
      draggedDocId,
      documentKits,
      reorderDocuments,
      invalidateDocumentKits,
      resetDragState,
      applyOptimisticMove,
      queryClient,
      projectId,
    ],
  )

  return {
    // State
    draggedDocId,
    dragOverDocId,
    dragOverPosition,
    dragOverFolderId,
    // Document handlers
    onDocDragStart,
    onDocDragOver,
    onDocDragLeave,
    onDocDragEnd,
    onDocDrop,
    // Folder handlers
    onFolderDragOver,
    onFolderDragLeave,
    onFolderDrop,
  }
}
