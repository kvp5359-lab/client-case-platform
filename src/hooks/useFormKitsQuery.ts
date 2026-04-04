"use client"

/**
 * React Query хук для списка анкет проекта.
 * Замена formKitStore (Zustand) — единый источник правды через React Query кэш.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { formKitKeys } from '@/hooks/queryKeys'
import {
  getFormKitsByProject,
  createFormKitFromTemplate,
  syncFormKitStructure,
  deleteFormKit,
} from '@/services/api/formKitService'
import type { Tables } from '@/types/database'

export type FormKit = Tables<'form_kits'>

export function useFormKitsQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: formKitKeys.byProject(projectId ?? ''),
    queryFn: () => getFormKitsByProject(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateFormKit(projectId: string, workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (templateId: string) =>
      createFormKitFromTemplate(templateId, projectId, workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
    },
    onError: (error) => {
      logger.error('Ошибка создания анкеты:', error)
      toast.error('Ошибка создания анкеты', {
        description: error instanceof Error ? error.message : undefined,
      })
    },
  })
}

export function useSyncFormKit(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (kitId: string) => syncFormKitStructure(kitId),
    onSuccess: (_data, kitId) => {
      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      // Инвалидируем все данные анкеты: detail, structure, fieldValues, compositeItems, selectOptions
      queryClient.invalidateQueries({ queryKey: formKitKeys.byId(kitId) })
      queryClient.invalidateQueries({ queryKey: formKitKeys.structure(kitId) })
      queryClient.invalidateQueries({ queryKey: formKitKeys.fieldValues(kitId) })
      queryClient.invalidateQueries({ queryKey: formKitKeys.compositeItems(kitId) })
      queryClient.invalidateQueries({ queryKey: formKitKeys.selectOptions(kitId) })
      queryClient.invalidateQueries({ queryKey: formKitKeys.detail(kitId) })
    },
    onError: (error) => {
      logger.error('Ошибка синхронизации анкеты:', error)
      toast.error('Ошибка синхронизации анкеты', {
        description: error instanceof Error ? error.message : undefined,
      })
    },
  })
}

export function useDeleteFormKit(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (kitId: string) => deleteFormKit(kitId),
    onMutate: async (kitId) => {
      await queryClient.cancelQueries({ queryKey: formKitKeys.byProject(projectId) })
      const previous = queryClient.getQueryData<FormKit[]>(formKitKeys.byProject(projectId))
      queryClient.setQueryData<FormKit[]>(formKitKeys.byProject(projectId), (old) =>
        old?.filter((kit) => kit.id !== kitId),
      )
      return { previous }
    },
    onError: (error, _kitId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(formKitKeys.byProject(projectId), context.previous)
      }
      logger.error('Ошибка удаления анкеты:', error)
      toast.error('Ошибка удаления анкеты', {
        description: error instanceof Error ? error.message : undefined,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
    },
  })
}
