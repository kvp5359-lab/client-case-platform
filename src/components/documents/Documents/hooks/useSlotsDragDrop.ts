"use client"

/**
 * Хук drag & drop для пустых слотов.
 *
 * Поведение зеркалит документный DnD, но проще:
 *  - реордер пустых слотов ВНУТРИ блока слотов папки (drop слота на слот);
 *  - перенос слота в другую папку (drop слота на карточку папки) — в конец её блока слотов.
 * Заполненные слоты не таскаются — они двигаются как документ внутри них.
 *
 * Порядок и folder_id живут в `folder_slots` (sort_order/folder_id), общий порядок
 * с документами НЕ ведётся — слоты всегда отображаются отдельным блоком под документами.
 */

import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { folderSlotKeys } from '@/hooks/queryKeys'
import type { FolderSlotWithDocument } from '@/components/documents/types'

export const SLOT_DND_MIME = 'application/x-slot-id'

type DragOverPosition = 'top' | 'bottom'

type SlotUpdate = { id: string; sort_order: number; folder_id?: string }

type UseSlotsDragDropProps = {
  projectId: string
  /** Все слоты проекта (источник правды для пересчёта порядка). */
  folderSlots: FolderSlotWithDocument[]
  reorderSlots: (updates: SlotUpdate[]) => Promise<void>
}

export function useSlotsDragDrop({
  projectId,
  folderSlots,
  reorderSlots,
}: UseSlotsDragDropProps) {
  const queryClient = useQueryClient()
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [slotDragOverPosition, setSlotDragOverPosition] = useState<DragOverPosition>('bottom')

  const isMovingRef = useRef(false)

  const resetDragState = useCallback(() => {
    setDraggedSlotId(null)
    setDragOverSlotId(null)
  }, [])

  /** Optimistic-патч кэша слотов: мгновенно правит sort_order/folder_id. Возвращает snapshot для отката. */
  const applyOptimistic = useCallback(
    (updates: SlotUpdate[]): FolderSlotWithDocument[] | undefined => {
      const qk = folderSlotKeys.byProject(projectId)
      const previous = queryClient.getQueryData<FolderSlotWithDocument[]>(qk)
      if (!previous) return undefined
      const map = new Map(updates.map((u) => [u.id, u]))
      queryClient.setQueryData<FolderSlotWithDocument[]>(qk, (old) =>
        (old ?? []).map((s) => {
          const u = map.get(s.id)
          if (!u) return s
          return {
            ...s,
            sort_order: u.sort_order,
            ...(u.folder_id !== undefined && { folder_id: u.folder_id }),
          }
        }),
      )
      return previous
    },
    [projectId, queryClient],
  )

  const persist = useCallback(
    async (updates: SlotUpdate[]) => {
      if (updates.length === 0) {
        isMovingRef.current = false
        resetDragState()
        return
      }
      const previous = applyOptimistic(updates)
      resetDragState()
      try {
        await reorderSlots(updates)
      } catch (error) {
        logger.error('Ошибка перемещения слота drag & drop:', error)
        if (previous) {
          queryClient.setQueryData(folderSlotKeys.byProject(projectId), previous)
        }
        toast.error('Не удалось переместить слот')
      } finally {
        isMovingRef.current = false
      }
    },
    [applyOptimistic, reorderSlots, resetDragState, queryClient, projectId],
  )

  // --- Handlers для пустого SlotItem ---

  const onSlotDragStart = useCallback((e: React.DragEvent, slotId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(SLOT_DND_MIME, slotId)
    setDraggedSlotId(slotId)
  }, [])

  const onSlotItemDragOver = useCallback(
    (e: React.DragEvent, targetSlotId: string) => {
      // Реагируем только на перетаскивание слота
      if (!e.dataTransfer.types.includes(SLOT_DND_MIME)) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      setDragOverSlotId(targetSlotId)
      setSlotDragOverPosition(e.clientY < midY ? 'top' : 'bottom')
    },
    [],
  )

  const onSlotItemDragLeave = useCallback(() => {
    setDragOverSlotId(null)
  }, [])

  const onSlotItemDragEnd = useCallback(() => {
    resetDragState()
  }, [resetDragState])

  const onSlotItemDrop = useCallback(
    (e: React.DragEvent, targetSlot: FolderSlotWithDocument) => {
      if (!e.dataTransfer.types.includes(SLOT_DND_MIME)) return
      e.preventDefault()
      e.stopPropagation()

      const slotId = draggedSlotId || e.dataTransfer.getData(SLOT_DND_MIME) || null
      const position = slotDragOverPosition
      if (!slotId || slotId === targetSlot.id || isMovingRef.current) {
        resetDragState()
        return
      }
      const dragged = folderSlots.find((s) => s.id === slotId)
      if (!dragged) {
        resetDragState()
        return
      }

      isMovingRef.current = true

      const targetFolderId = targetSlot.folder_id
      const emptyInTarget = folderSlots
        .filter((s) => !s.document_id && s.folder_id === targetFolderId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      const filtered = emptyInTarget.filter((s) => s.id !== slotId)
      const targetIndex = filtered.findIndex((s) => s.id === targetSlot.id)
      const insertIndex = position === 'top' ? targetIndex : targetIndex + 1
      filtered.splice(insertIndex < 0 ? filtered.length : insertIndex, 0, dragged)

      const updates: SlotUpdate[] = filtered.map((s, idx) => ({
        id: s.id,
        sort_order: idx,
        ...(s.id === slotId &&
          dragged.folder_id !== targetFolderId && { folder_id: targetFolderId }),
      }))

      void persist(updates)
    },
    [draggedSlotId, slotDragOverPosition, folderSlots, persist, resetDragState],
  )

  // --- Drop слота на карточку папки (перенос в конец её блока слотов) ---

  const onFolderSlotDrop = useCallback(
    (e: React.DragEvent, targetFolderId: string) => {
      if (!e.dataTransfer.types.includes(SLOT_DND_MIME)) return
      e.preventDefault()
      e.stopPropagation()

      const slotId = draggedSlotId || e.dataTransfer.getData(SLOT_DND_MIME) || null
      if (!slotId || isMovingRef.current) {
        resetDragState()
        return
      }
      const dragged = folderSlots.find((s) => s.id === slotId)
      if (!dragged || dragged.folder_id === targetFolderId) {
        // Та же папка — реордер делает drop на слот, не на папку
        resetDragState()
        return
      }

      isMovingRef.current = true

      const emptyInTarget = folderSlots.filter(
        (s) => !s.document_id && s.folder_id === targetFolderId,
      )
      const maxOrder =
        emptyInTarget.length > 0
          ? Math.max(...emptyInTarget.map((s) => s.sort_order || 0))
          : -1

      void persist([{ id: slotId, sort_order: maxOrder + 1, folder_id: targetFolderId }])
    },
    [draggedSlotId, folderSlots, persist, resetDragState],
  )

  return {
    draggedSlotId,
    dragOverSlotId,
    slotDragOverPosition,
    onSlotDragStart,
    onSlotItemDragOver,
    onSlotItemDragLeave,
    onSlotItemDragEnd,
    onSlotItemDrop,
    onFolderSlotDrop,
  }
}
