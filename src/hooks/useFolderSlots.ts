"use client"

/**
 * Хук для работы со слотами документов в папках
 *
 * Слот — зарезервированное место для конкретного документа.
 * Может быть пустым (ожидает загрузки) или заполненным (привязан к документу).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { folderSlotKeys, documentKitKeys, kitlessDocumentKeys } from '@/hooks/queryKeys'
import type { FolderSlotWithDocument } from '@/components/documents/types'

export function useFolderSlots(projectId: string) {
  const queryClient = useQueryClient()

  // Загрузка всех слотов проекта с данными документов
  const slotsQuery = useQuery({
    queryKey: folderSlotKeys.byProject(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('folder_slots')
        .select(
          `
          *,
          document:documents (
            *,
            document_files (*)
          )
        `,
        )
        .eq('project_id', projectId)
        .eq('document.document_files.is_current', true)
        .order('sort_order', { ascending: true })

      if (error) throw error

      // Фильтруем: если документ удалён — считаем слот пустым
      return ((data || []) as FolderSlotWithDocument[]).map((slot) => {
        const doc = slot.document as
          | (FolderSlotWithDocument['document'] & { is_deleted?: boolean })
          | null
        if (doc?.is_deleted === true) {
          return { ...slot, document: null, document_id: null }
        }
        return slot
      })
    },
    enabled: !!projectId,
  })

  // Создание слота
  const createSlotMutation = useMutation({
    mutationFn: async (slot: {
      folder_id: string
      project_id: string
      workspace_id: string
      name: string
      sort_order?: number
      folder_template_slot_id?: string | null
    }) => {
      const { data, error } = await supabase.from('folder_slots').insert(slot).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
    },
  })

  // Обновление слота (переименование, описание, изменение порядка)
  const updateSlotMutation = useMutation({
    mutationFn: async ({
      slotId,
      updates,
    }: {
      slotId: string
      updates: { name?: string; description?: string | null; sort_order?: number }
    }) => {
      const { error } = await supabase.from('folder_slots').update(updates).eq('id', slotId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
    },
  })

  // Удаление слота (документ не удаляется)
  const deleteSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase.from('folder_slots').delete().eq('id', slotId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
    },
  })

  // Удаление всех пустых слотов папки (batch)
  const deleteEmptySlotsMutation = useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from('folder_slots')
        .delete()
        .eq('project_id', projectId)
        .eq('folder_id', folderId)
        .is('document_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
    },
  })

  // Привязка документа к слоту (атомарно через RPC)
  // RPC fill_slot_atomic выполняет в одной транзакции:
  //   1. Получение folder_id + document_kit_id из слота
  //   2. Отвязку документа от других слотов проекта
  //   3. Привязку к целевому слоту
  //   4. Обновление document_kit_id и folder_id документа
  const fillSlotMutation = useMutation({
    mutationFn: async ({ slotId, documentId }: { slotId: string; documentId: string }) => {
      const { error } = await supabase.rpc('fill_slot_atomic', {
        p_slot_id: slotId,
        p_document_id: documentId,
        p_project_id: projectId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: kitlessDocumentKeys.byProject(projectId) })
    },
  })

  // Отвязка документа от слота (документ остаётся, но теряет kit и folder)
  const unlinkSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      const { error } = await supabase
        .from('folder_slots')
        .update({ document_id: null })
        .eq('id', slotId)
      if (error) throw error
      // document_kit_id и folder_id не трогаем — документ остаётся в папке
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: kitlessDocumentKeys.byProject(projectId) })
    },
  })

  return {
    slots: slotsQuery.data || [],
    isLoading: slotsQuery.isLoading,
    createSlot: createSlotMutation.mutateAsync,
    updateSlot: updateSlotMutation.mutateAsync,
    deleteSlot: deleteSlotMutation.mutateAsync,
    deleteEmptySlots: deleteEmptySlotsMutation.mutateAsync,
    fillSlot: fillSlotMutation.mutateAsync,
    unlinkSlot: unlinkSlotMutation.mutateAsync,
    refetchSlots: slotsQuery.refetch,
  }
}
