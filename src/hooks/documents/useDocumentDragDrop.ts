"use client"

/**
 * Хук для управления drag & drop документов
 */

import { useState, useCallback } from 'react'
import type { SourceDocument } from '@/components/documents/types'

type DragOverPosition = 'top' | 'bottom'

interface UseDocumentDragDropReturn {
  /** ID перетаскиваемого документа */
  draggedDocId: string | null
  /** ID документа, над которым находится перетаскиваемый */
  dragOverDocId: string | null
  /** Позиция (сверху/снизу от документа) */
  dragOverPosition: DragOverPosition
  /** ID папки, над которой находится перетаскиваемый документ */
  dragOverFolderId: string | null
  /** Перетаскиваемый документ из источника */
  draggedSourceDoc: SourceDocument | null

  // Обработчики для документов
  handleDocDragStart: (e: React.DragEvent, docId: string) => void
  handleDocDragOver: (e: React.DragEvent, docId: string) => void
  handleDocDragLeave: () => void
  handleDocDragEnd: () => void

  // Обработчики для папок
  handleFolderDragOver: (e: React.DragEvent, folderId: string | null) => void
  handleFolderDragLeave: () => void

  // Обработчики для документов из источника
  handleSourceDocDragStart: (e: React.DragEvent, file: SourceDocument) => void
  handleSourceDocDragEnd: () => void

  // Сброс состояния
  resetDragState: () => void

  // Setters для Context (ФАЗА 3)
  setDraggedDoc: (docId: string | null) => void
  setDragOverDoc: (data: { docId: string | null; position: 'above' | 'below' | null }) => void
  setDragOverFolder: (folderId: string | null) => void
  setDraggedSourceDoc: (file: SourceDocument | File | null) => void
}

export function useDocumentDragDrop(): UseDocumentDragDropReturn {
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null)
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<DragOverPosition>('bottom')
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [draggedSourceDoc, setDraggedSourceDoc] = useState<SourceDocument | null>(null)

  // Обработчики для документов
  const handleDocDragStart = useCallback((e: React.DragEvent, docId: string) => {
    setDraggedDocId(docId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-document-id', docId)
  }, [])

  const handleDocDragOver = useCallback((e: React.DragEvent, docId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Определяем позицию курсора относительно элемента
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position: DragOverPosition = e.clientY < midY ? 'top' : 'bottom'

    setDragOverDocId(docId)
    setDragOverPosition(position)
  }, [])

  const handleDocDragLeave = useCallback(() => {
    setDragOverDocId(null)
  }, [])

  const handleDocDragEnd = useCallback(() => {
    setDraggedDocId(null)
    setDragOverDocId(null)
    setDragOverFolderId(null)
  }, [])

  // Обработчики для папок
  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    setDragOverFolderId(folderId === null ? 'unassigned' : folderId)
  }, [])

  const handleFolderDragLeave = useCallback(() => {
    setDragOverFolderId(null)
  }, [])

  // Обработчики для документов из источника
  const handleSourceDocDragStart = useCallback((e: React.DragEvent, file: SourceDocument) => {
    setDraggedSourceDoc(file)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/json', JSON.stringify(file))
  }, [])

  const handleSourceDocDragEnd = useCallback(() => {
    setDraggedSourceDoc(null)
    setDragOverFolderId(null)
  }, [])

  // Сброс состояния
  const resetDragState = useCallback(() => {
    setDraggedDocId(null)
    setDragOverDocId(null)
    setDragOverFolderId(null)
    setDraggedSourceDoc(null)
  }, [])

  // Wrapper для setDragOverDoc с преобразованием формата (Context использует другой формат)
  const setDragOverDocWrapper = useCallback(
    (data: { docId: string | null; position: 'above' | 'below' | null }) => {
      setDragOverDocId(data.docId)
      if (data.position) {
        setDragOverPosition(data.position === 'above' ? 'top' : 'bottom')
      }
    },
    [],
  )

  // Wrapper для setDraggedSourceDoc — принимает только SourceDocument или null
  const setDraggedSourceDocWrapper = useCallback((file: SourceDocument | File | null) => {
    if (file && !('id' in file && 'sourceDocumentId' in file)) {
      setDraggedSourceDoc(null)
      return
    }
    setDraggedSourceDoc(file as SourceDocument | null)
  }, [])

  return {
    draggedDocId,
    dragOverDocId,
    dragOverPosition,
    dragOverFolderId,
    draggedSourceDoc,
    handleDocDragStart,
    handleDocDragOver,
    handleDocDragLeave,
    handleDocDragEnd,
    handleFolderDragOver,
    handleFolderDragLeave,
    handleSourceDocDragStart,
    handleSourceDocDragEnd,
    resetDragState,
    // Setters для Context (ФАЗА 3)
    setDraggedDoc: setDraggedDocId,
    setDragOverDoc: setDragOverDocWrapper,
    setDragOverFolder: setDragOverFolderId,
    setDraggedSourceDoc: setDraggedSourceDocWrapper,
  }
}
