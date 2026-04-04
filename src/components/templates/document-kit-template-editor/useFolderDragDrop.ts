/**
 * Хук для drag & drop логики папок
 */

import { useState } from 'react'
import { KitFolder } from './types'

interface UseFolderDragDropProps {
  kitFolders: KitFolder[]
  onReorder: (updates: { id: string; order_index: number }[]) => void
}

export function useFolderDragDrop({ kitFolders, onReorder }: UseFolderDragDropProps) {
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom'>('top')

  const handleDragStart = (e: React.DragEvent, folderId: string) => {
    setDraggedFolderId(folderId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (draggedFolderId && draggedFolderId !== folderId) {
      setDragOverFolderId(folderId)

      // Определяем, в верхнюю или нижнюю часть строки перетаскивается папка
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height
      const position = y < height / 2 ? 'top' : 'bottom'

      setDragOverPosition(position)
    }
  }

  const handleDragLeave = () => {
    setDragOverFolderId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetFolder: KitFolder) => {
    e.preventDefault()
    setDragOverFolderId(null)

    if (!draggedFolderId || draggedFolderId === targetFolder.id) {
      setDraggedFolderId(null)
      return
    }

    const draggedFolder = kitFolders.find((f) => f.id === draggedFolderId)
    if (!draggedFolder) {
      setDraggedFolderId(null)
      return
    }

    // Все папки отсортированные по order_index
    const allFoldersSorted = [...kitFolders].sort((a, b) => a.order_index - b.order_index)

    const draggedIndex = allFoldersSorted.findIndex((f) => f.id === draggedFolderId)
    const targetIndex = allFoldersSorted.findIndex((f) => f.id === targetFolder.id)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedFolderId(null)
      return
    }

    // Обновляем порядок папок
    const newOrder = [...allFoldersSorted]
    const [removed] = newOrder.splice(draggedIndex, 1)

    // Определяем позицию вставки на основе dragOverPosition
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    const insertIndex = dragOverPosition === 'top' ? adjustedTargetIndex : adjustedTargetIndex + 1

    newOrder.splice(insertIndex, 0, removed)

    // Обновляем order_index для всех папок
    const updates = newOrder.map((folder, idx) => ({
      id: folder.id,
      order_index: idx,
    }))

    onReorder(updates)
    setDraggedFolderId(null)
  }

  const handleDragEnd = () => {
    setDraggedFolderId(null)
    setDragOverFolderId(null)
  }

  return {
    draggedFolderId,
    dragOverFolderId,
    dragOverPosition,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  }
}
