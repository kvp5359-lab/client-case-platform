"use client"

/**
 * Handlers для Drag & Drop операций
 * Выделено из useDocumentKitContextHandlers для разделения ответственности
 */

import { useCallback, useMemo } from 'react'
import type { DocumentWithFiles, SourceDocument } from '@/components/documents/types'

interface UseDragDropHandlersParams {
  handlers: {
    handleFolderDrop: (e: React.DragEvent, targetFolderId: string | null) => Promise<void>
    handleDocDrop: (e: React.DragEvent, targetDoc: DocumentWithFiles) => Promise<void>
  }
  setDraggedDoc: (docId: string | null) => void
  setDragOverDoc: (data: { docId: string | null; position: 'above' | 'below' | null }) => void
  setDragOverFolder: (folderId: string | null) => void
  setDraggedSourceDoc: (file: SourceDocument | File | null) => void
  resetDragState: () => void
}

export function useDragDropHandlers(params: UseDragDropHandlersParams) {
  const {
    handlers,
    setDraggedDoc,
    setDragOverDoc,
    setDragOverFolder,
    setDraggedSourceDoc,
    resetDragState,
  } = params

  // Деструктурируем для стабильных зависимостей useCallback
  const { handleFolderDrop, handleDocDrop } = handlers

  const onDocDragStart = useCallback(
    (e: React.DragEvent, docId: string) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-document-id', docId)
      setDraggedDoc(docId)
    },
    [setDraggedDoc],
  )

  const onDocDragOver = useCallback(
    (e: React.DragEvent, targetDocId: string) => {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseY = e.clientY - rect.top
      const position = mouseY < rect.height / 2 ? 'above' : 'below'
      setDragOverDoc({ docId: targetDocId, position })
    },
    [setDragOverDoc],
  )

  const onDocDragLeave = useCallback(
    () => setDragOverDoc({ docId: null, position: null }),
    [setDragOverDoc],
  )

  const onDocDrop = useCallback(
    (e: React.DragEvent, targetDoc: DocumentWithFiles) => {
      e.preventDefault()
      handleDocDrop(e, targetDoc)
      resetDragState()
    },
    [handleDocDrop, resetDragState],
  )

  const onDocDragEnd = useCallback(() => resetDragState(), [resetDragState])

  const onFolderDragOver = useCallback(
    (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault()
      setDragOverFolder(folderId)
    },
    [setDragOverFolder],
  )

  const onFolderDragLeave = useCallback(() => setDragOverFolder(null), [setDragOverFolder])

  const onFolderDrop = useCallback(
    (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault()
      handleFolderDrop(e, folderId)
      resetDragState()
    },
    [handleFolderDrop, resetDragState],
  )

  const onSourceDocDragStart = useCallback(
    (e: React.DragEvent, file: SourceDocument) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-source-doc', 'true')
      e.dataTransfer.setData(
        'application/x-source-doc-json',
        JSON.stringify({ id: file.id, name: file.name, sourceDocumentId: file.sourceDocumentId }),
      )
      setDraggedSourceDoc(file)
    },
    [setDraggedSourceDoc],
  )

  const onSourceDocDragEnd = useCallback(() => setDraggedSourceDoc(null), [setDraggedSourceDoc])

  return useMemo(
    () => ({
      onDocDragStart,
      onDocDragOver,
      onDocDragLeave,
      onDocDrop,
      onDocDragEnd,
      onFolderDragOver,
      onFolderDragLeave,
      onFolderDrop,
      onSourceDocDragStart,
      onSourceDocDragEnd,
    }),
    [
      onDocDragStart,
      onDocDragOver,
      onDocDragLeave,
      onDocDrop,
      onDocDragEnd,
      onFolderDragOver,
      onFolderDragLeave,
      onFolderDrop,
      onSourceDocDragStart,
      onSourceDocDragEnd,
    ],
  )
}
