"use client"

/**
 * React Query хуки для наборов документов (Document Kits)
 *
 * Заменяет ручной fetch через Zustand store на автоматический кэш React Query.
 * После мутаций данные обновляются через invalidateQueries — без ручного refetch.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { documentKitKeys, folderSlotKeys } from '@/hooks/queryKeys'
import {
  getDocumentKitsWithContents,
  createDocumentKitFromTemplate,
  syncDocumentKitStructure,
  deleteDocumentKit,
} from '@/services/api/documents/documentKitService'
import type { DocumentKitWithDocuments } from '@/services/api/documents/documentKitService'
import { useOptimisticMutation } from '@/hooks/shared/useOptimisticMutation'

/**
 * Загрузка наборов документов для проекта.
 *
 * Параметр `enabled` — опциональный флаг. Позволяет родителю отложить запрос
 * до тех пор, пока он реально нужен (например, активна вкладка "Документы").
 * Иначе данные грузятся при открытии проекта, даже если юзер сразу идёт в другую вкладку.
 */
export function useDocumentKitsQuery(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: documentKitKeys.byProject(projectId ?? ''),
    queryFn: () => getDocumentKitsWithContents(projectId ?? ''),
    enabled: !!projectId && enabled,
  })
}

/**
 * Создание набора документов из шаблона
 */
export function useCreateDocumentKitMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      templateId,
      projectId,
      workspaceId,
    }: {
      templateId: string
      projectId: string
      workspaceId: string
    }) => {
      return createDocumentKitFromTemplate(templateId, projectId, workspaceId)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKitKeys.byProject(variables.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: folderSlotKeys.byProject(variables.projectId),
      })
    },
    onError: (error) => {
      logger.error('Ошибка создания набора документов:', error)
      toast.error('Не удалось создать набор документов')
    },
  })
}

/**
 * Синхронизация набора документов с шаблоном
 */
export function useSyncDocumentKitMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ kitId, projectId }: { kitId: string; projectId: string }) => {
      await syncDocumentKitStructure(kitId, projectId)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKitKeys.byProject(variables.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: folderSlotKeys.byProject(variables.projectId),
      })
    },
    onError: (error) => {
      logger.error('Ошибка синхронизации набора:', error)
      toast.error('Не удалось синхронизировать набор')
    },
  })
}

/**
 * Удаление набора документов
 */
export function useDeleteDocumentKitMutation() {
  return useOptimisticMutation<
    DocumentKitWithDocuments[],
    { kitId: string; projectId: string }
  >({
    queryKey: (v) => documentKitKeys.byProject(v.projectId),
    mutationFn: async ({ kitId }) => { await deleteDocumentKit(kitId) },
    optimisticUpdate: (old, { kitId }) => old?.filter((kit) => kit.id !== kitId),
    errorMessage: 'Не удалось удалить набор',
  })
}

/**
 * Переименование набора документов
 */
export function useRenameDocumentKitMutation() {
  return useOptimisticMutation<
    DocumentKitWithDocuments[],
    { kitId: string; name: string; projectId: string }
  >({
    queryKey: (v) => documentKitKeys.byProject(v.projectId),
    mutationFn: async ({ kitId, name }) => {
      const { error } = await supabase.from('document_kits').update({ name }).eq('id', kitId)
      if (error) throw error
    },
    optimisticUpdate: (old, { kitId, name }) =>
      old?.map((kit) => (kit.id === kitId ? { ...kit, name } : kit)),
    errorMessage: 'Не удалось переименовать набор',
  })
}

/**
 * Перемещение набора документов (вверх/вниз)
 */
export function useMoveDocumentKitMutation() {
  return useOptimisticMutation<
    DocumentKitWithDocuments[],
    {
      kitId: string
      neighborKitId: string
      kitSortOrder: number
      neighborSortOrder: number
      projectId: string
    }
  >({
    queryKey: (v) => documentKitKeys.byProject(v.projectId),
    mutationFn: async ({ kitId, neighborKitId, kitSortOrder, neighborSortOrder }) => {
      const { error: e1 } = await supabase
        .from('document_kits')
        .update({ sort_order: neighborSortOrder })
        .eq('id', kitId)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('document_kits')
        .update({ sort_order: kitSortOrder })
        .eq('id', neighborKitId)
      if (e2) throw e2
    },
    optimisticUpdate: (old, { kitId, neighborKitId }) => {
      if (!old) return old
      const updated = old.map((kit) => {
        if (kit.id === kitId) {
          const neighbor = old.find((k) => k.id === neighborKitId)
          return { ...kit, sort_order: neighbor?.sort_order ?? kit.sort_order }
        }
        if (kit.id === neighborKitId) {
          const target = old.find((k) => k.id === kitId)
          return { ...kit, sort_order: target?.sort_order ?? kit.sort_order }
        }
        return kit
      })
      updated.sort((a, b) => a.sort_order - b.sort_order)
      return updated
    },
    errorMessage: 'Не удалось переместить набор',
  })
}

/**
 * Обновление статуса папки
 */
export function useUpdateFolderStatusMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      folderId,
      status,
    }: {
      folderId: string
      status: string | null
      projectId: string
    }) => {
      const { error } = await supabase.from('folders').update({ status }).eq('id', folderId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKitKeys.byProject(variables.projectId),
      })
    },
    onError: (error) => {
      logger.error('Ошибка обновления статуса папки:', error)
      toast.error('Не удалось обновить статус папки')
    },
  })
}
