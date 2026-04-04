"use client"

/**
 * Хук для операций с наборами документов: sync и delete
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import {
  useDeleteDocumentKitMutation,
  useSyncDocumentKitMutation,
  useMoveDocumentKitMutation,
} from '@/hooks/useDocumentKitsQuery'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { DeleteKitMode } from '@/components/projects/DocumentKitsTab/dialogs/DeleteKitDialog'

interface UseKitActionsParams {
  projectId: string
  documentKits?: DocumentKitWithDocuments[]
}

export function useKitActions({ projectId, documentKits = [] }: UseKitActionsParams) {
  // === Переместить набор ===
  const moveMutation = useMoveDocumentKitMutation()

  const handleMoveKit = useCallback(
    (kit: DocumentKitWithDocuments, direction: 'up' | 'down') => {
      const index = documentKits.findIndex((k) => k.id === kit.id)
      if (index === -1) return
      const neighborIndex = direction === 'up' ? index - 1 : index + 1
      if (neighborIndex < 0 || neighborIndex >= documentKits.length) return
      const neighbor = documentKits[neighborIndex]
      moveMutation.mutate({
        kitId: kit.id,
        neighborKitId: neighbor.id,
        kitSortOrder: kit.sort_order,
        neighborSortOrder: neighbor.sort_order,
        projectId,
      })
    },
    [documentKits, moveMutation, projectId],
  )

  // === Обновить состав набора ===
  const syncMutation = useSyncDocumentKitMutation()
  const {
    state: syncKitConfirmState,
    confirm: confirmSyncKit,
    handleConfirm: syncKitHandleConfirm,
    handleCancel: syncKitHandleCancel,
  } = useConfirmDialog()

  const handleSyncKit = useCallback(
    async (kit: DocumentKitWithDocuments) => {
      const ok = await confirmSyncKit({
        title: `Обновить состав набора «${kit.name}»?`,
        description:
          'Названия, описания и настройки папок будут обновлены в соответствии с текущим шаблоном. Документы в папках останутся без изменений.',
        confirmText: 'Обновить',
      })
      if (!ok) return
      try {
        await syncMutation.mutateAsync({ kitId: kit.id, projectId })
        toast.success('Состав набора обновлён')
      } catch {
        toast.error('Не удалось обновить состав набора')
      }
    },
    [syncMutation, projectId, confirmSyncKit],
  )

  // === Удалить набор ===
  const deleteMutation = useDeleteDocumentKitMutation()
  const [deleteKitDialogOpen, setDeleteKitDialogOpen] = useState<DocumentKitWithDocuments | null>(
    null,
  )

  const handleDeleteKit = useCallback((kit: DocumentKitWithDocuments) => {
    setDeleteKitDialogOpen(kit)
  }, [])

  const handleDeleteKitConfirm = useCallback(
    async (mode: DeleteKitMode) => {
      const kit = deleteKitDialogOpen
      if (!kit) return
      setDeleteKitDialogOpen(null)
      try {
        if (mode === 'move_to_unassigned') {
          const { error } = await supabase
            .from('documents')
            .update({ document_kit_id: null, folder_id: null })
            .eq('document_kit_id', kit.id)
          if (error) throw error
        }
        await deleteMutation.mutateAsync({ kitId: kit.id, projectId })
        toast.success('Набор документов удалён')
      } catch {
        toast.error('Не удалось удалить набор документов')
      }
    },
    [deleteKitDialogOpen, deleteMutation, projectId],
  )

  return {
    // Move
    handleMoveKit,
    // Sync
    syncKitConfirmState,
    syncKitHandleConfirm,
    syncKitHandleCancel,
    handleSyncKit,
    // Delete
    deleteKitDialogOpen,
    setDeleteKitDialogOpen,
    handleDeleteKit,
    handleDeleteKitConfirm,
  }
}
