"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentTemplateKeys } from '../queryKeys'
import {
  getDocumentTemplates,
  uploadDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  replaceDocumentTemplateFile,
  generateDocument,
} from '@/services/api/documents/documentTemplateService'
import { downloadGeneratedFile } from '@/services/api/documents/documentGenerationService'
import type { DocumentTemplatePlaceholder } from '@/services/api/documents/documentTemplateService'
import { toast } from 'sonner'

export function useDocumentTemplates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: documentTemplateKeys.byWorkspace(workspaceId!),
    queryFn: () => getDocumentTemplates(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useUploadDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: uploadDocumentTemplate,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentTemplateKeys.byWorkspace(variables.workspaceId),
      })
      toast.success('Шаблон документа загружен')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Ошибка загрузки шаблона')
    },
  })
}

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: {
        name?: string
        description?: string | null
        placeholders?: DocumentTemplatePlaceholder[]
        form_template_id?: string | null
      }
    }) => updateDocumentTemplate(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
      toast.success('Шаблон обновлён')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Ошибка обновления')
    },
  })
}

export function useReplaceDocumentTemplateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: replaceDocumentTemplateFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
      toast.success('Файл шаблона обновлён')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Ошибка замены файла')
    },
  })
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteDocumentTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
      toast.success('Шаблон удалён')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Ошибка удаления')
    },
  })
}

export function useGenerateDocument() {
  return useMutation({
    mutationFn: generateDocument,
    onSuccess: (result) => {
      downloadGeneratedFile(
        result.fileBase64,
        result.fileName,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      toast.success('Документ сгенерирован и скачан')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Ошибка генерации документа')
    },
  })
}
