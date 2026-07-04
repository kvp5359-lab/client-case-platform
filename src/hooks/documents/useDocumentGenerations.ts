"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentGenerationKeys, STALE_TIME } from '../queryKeys'
import {
  getDocumentGenerations,
  createDocumentGeneration,
  updateDocumentGeneration,
  deleteDocumentGeneration,
  fillPlaceholdersFromFormKit,
  generateDocumentWithValues,
  downloadGeneratedFile,
  base64ToFile,
} from '@/services/api/documents/documentGenerationService'
import type { DocumentTemplatePlaceholder } from '@/services/api/documents/documentTemplateService'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

export function useDocumentGenerations(projectId: string | undefined) {
  return useQuery({
    queryKey: documentGenerationKeys.byProject(projectId!),
    queryFn: () => getDocumentGenerations(projectId!),
    enabled: !!projectId,
    staleTime: STALE_TIME.MEDIUM,
  })
}

export function useCreateDocumentGeneration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createDocumentGeneration,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentGenerationKeys.byProject(variables.projectId),
      })
      toast.success('Блок генерации создан')
    },
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error, 'Ошибка создания блока генерации'))
    },
  })
}

export function useUpdateDocumentGeneration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: { name?: string; placeholder_values?: Record<string, string> }
    }) => updateDocumentGeneration(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentGenerationKeys.all })
    },
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error, 'Ошибка сохранения'))
    },
  })
}

export function useDeleteDocumentGeneration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteDocumentGeneration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentGenerationKeys.all })
      toast.success('Блок генерации удалён')
    },
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error, 'Ошибка удаления'))
    },
  })
}

export function useFillFromFormKit() {
  return useMutation({
    mutationFn: (params: { projectId: string; placeholders: DocumentTemplatePlaceholder[] }) =>
      fillPlaceholdersFromFormKit(params),
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error, 'Ошибка заполнения из анкеты'))
    },
  })
}

export function useGenerateFromGeneration() {
  return useMutation({
    mutationFn: generateDocumentWithValues,
    onError: (error) => {
      toast.error(getUserFacingErrorMessage(error, 'Ошибка генерации документа'))
    },
  })
}

export { downloadGeneratedFile, base64ToFile }
