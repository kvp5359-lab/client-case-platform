"use client"

/**
 * Операции со слотами: создание, удаление, переименование, drag-drop привязка
 */

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

interface UseCardViewSlotActionsParams {
  projectId: string
  workspaceId: string
  createSlot: (params: {
    folder_id: string
    project_id: string
    workspace_id: string
    name: string
  }) => Promise<{ id: string }>
  deleteSlot: (slotId: string) => Promise<void>
  updateSlot: (params: { slotId: string; updates: { name?: string } }) => Promise<void>
  fillSlot: (params: { slotId: string; documentId: string }) => Promise<void>
  invalidateDocumentKits: () => void
}

export function useCardViewSlotActions({
  projectId,
  workspaceId,
  createSlot,
  deleteSlot,
  updateSlot,
  fillSlot,
  invalidateDocumentKits,
}: UseCardViewSlotActionsParams) {
  const [newSlotId, setNewSlotId] = useState<string | null>(null)
  const isCreatingSlotRef = useRef(false)

  const handleAddSlot = useCallback(
    async (folderId: string) => {
      if (isCreatingSlotRef.current) return
      isCreatingSlotRef.current = true
      try {
        const result = await createSlot({
          folder_id: folderId,
          project_id: projectId,
          workspace_id: workspaceId,
          name: 'Новый слот',
        })
        setNewSlotId(result.id)
      } catch {
        toast.error('Не удалось создать слот')
      } finally {
        isCreatingSlotRef.current = false
      }
    },
    [createSlot, projectId, workspaceId],
  )

  const handleSlotDrop = useCallback(
    async (slotId: string, documentId: string) => {
      try {
        await fillSlot({ slotId, documentId })
        invalidateDocumentKits()
      } catch {
        toast.error('Не удалось привязать документ к слоту')
      }
    },
    [fillSlot, invalidateDocumentKits],
  )

  const handleSlotDelete = useCallback(
    async (slotId: string) => {
      try {
        await deleteSlot(slotId)
      } catch {
        toast.error('Не удалось удалить слот')
      }
    },
    [deleteSlot],
  )

  const handleSlotRename = useCallback(
    async (slotId: string, name: string) => {
      try {
        await updateSlot({ slotId, updates: { name } })
      } catch {
        toast.error('Не удалось переименовать слот')
      }
    },
    [updateSlot],
  )

  const handleNewSlotCreated = useCallback(() => setNewSlotId(null), [])

  return {
    newSlotId,
    handleAddSlot,
    handleSlotDrop,
    handleSlotDelete,
    handleSlotRename,
    handleNewSlotCreated,
  }
}
