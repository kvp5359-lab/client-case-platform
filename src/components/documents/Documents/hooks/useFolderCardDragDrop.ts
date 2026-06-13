"use client"

/**
 * Хук drag & drop для FolderCard
 * Обрабатывает source docs, messenger attachments и обычные документы
 */

import { useState, useEffect, useCallback } from 'react'
import { useDocumentsContext } from '../DocumentsContext'

export function useFolderCardDragDrop(folderId: string) {
  const {
    onSourceDocDrop,
    onMessengerAttachmentDrop,
    draggedDocId,
    dragOverFolderId,
    onFolderDragOver,
    onFolderDragLeave,
    onFolderDrop,
  } = useDocumentsContext()

  const [isSourceDragOver, setIsSourceDragOver] = useState(false)

  // Сбрасываем фиолетовый контур при завершении drag (drop или cancel)
  useEffect(() => {
    const reset = () => setIsSourceDragOver(false)
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    return () => {
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
    }
  }, [])

  const isDocDragOver = dragOverFolderId === folderId && !!draggedDocId

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (
        e.dataTransfer.types.includes('application/x-source-doc') ||
        e.dataTransfer.types.includes('application/x-messenger-attachment')
      ) {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-source-doc')
          ? 'move'
          : 'copy'
        setIsSourceDragOver(true)
      } else {
        onFolderDragOver(e, folderId)
      }
    },
    [onFolderDragOver, folderId],
  )

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null
      if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
        setIsSourceDragOver(false)
        onFolderDragLeave(e)
      }
    },
    [onFolderDragLeave],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsSourceDragOver(false)
      const isSourceDoc = e.dataTransfer.getData('application/x-source-doc') === 'true'
      if (isSourceDoc) {
        e.preventDefault()
        e.stopPropagation()
        const json = e.dataTransfer.getData('application/x-source-doc-json')
        if (json) {
          onSourceDocDrop(json, folderId)
        }
        return
      }

      const isMessengerAttachment =
        e.dataTransfer.getData('application/x-messenger-attachment') === 'true'
      if (isMessengerAttachment) {
        e.preventDefault()
        e.stopPropagation()
        const json = e.dataTransfer.getData('application/x-messenger-attachment-json')
        if (json) {
          onMessengerAttachmentDrop(json, folderId)
        }
        return
      }

      onFolderDrop(e, folderId)
    },
    [onSourceDocDrop, onMessengerAttachmentDrop, onFolderDrop, folderId],
  )

  return {
    isSourceDragOver,
    isDocDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    draggedDocId,
  }
}
