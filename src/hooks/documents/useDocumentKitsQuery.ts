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
import { documentKitKeys, folderSlotKeys, googleDriveKeys, STALE_TIME } from '@/hooks/queryKeys'
import {
  getDocumentKitsWithContents,
  createDocumentKitFromTemplate,
  createDocumentKitFromDriveFolder,
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
    staleTime: STALE_TIME.MEDIUM,
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
 * Создание набора документов из папки Google Drive.
 * Корневая папка → набор, подпапки → папки, файлы → source_documents набора.
 */
export function useCreateDocumentKitFromDriveMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      link,
      projectId,
      workspaceId,
    }: {
      link: string
      projectId: string
      workspaceId: string
    }) => {
      return createDocumentKitFromDriveFolder({ link, projectId, workspaceId })
    },
    onSuccess: (_kitId, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKitKeys.byProject(variables.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: folderSlotKeys.byProject(variables.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.sourceDocuments(variables.projectId),
      })
    },
    // Ошибку показывает вызывающий диалог (с конкретным текстом из сервиса)
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
 * Перемещение набора документов (вверх/вниз).
 *
 * После свопа перенумеровывает sort_order у всех наборов проекта подряд (0..N-1).
 * Это страхует от коллизий: если у двух наборов случайно совпал sort_order,
 * простой swap двух значений был бы no-op. Перенумерация всегда даёт детерминированный порядок.
 */
export function useMoveDocumentKitMutation() {
  return useOptimisticMutation<
    DocumentKitWithDocuments[],
    {
      kitId: string
      direction: 'up' | 'down'
      projectId: string
    }
  >({
    queryKey: (v) => documentKitKeys.byProject(v.projectId),
    mutationFn: async ({ kitId, direction, projectId }) => {
      const { data: kits, error: fetchError } = await supabase
        .from('document_kits')
        .select('id, sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
      if (fetchError) throw fetchError
      if (!kits) return

      const index = kits.findIndex((k) => k.id === kitId)
      if (index === -1) return
      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= kits.length) return

      const reordered = [...kits]
      ;[reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]]

      // Записываем только те, у кого sort_order реально изменился.
      const updates = reordered
        .map((kit, i) => ({ id: kit.id, newOrder: i, oldOrder: kit.sort_order }))
        .filter((u) => u.newOrder !== u.oldOrder)

      for (const u of updates) {
        const { error } = await supabase
          .from('document_kits')
          .update({ sort_order: u.newOrder })
          .eq('id', u.id)
        if (error) throw error
      }
    },
    optimisticUpdate: (old, { kitId, direction }) => {
      if (!old) return old
      const index = old.findIndex((k) => k.id === kitId)
      if (index === -1) return old
      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= old.length) return old
      const reordered = [...old]
      ;[reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]]
      return reordered.map((kit, i) => ({ ...kit, sort_order: i }))
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
