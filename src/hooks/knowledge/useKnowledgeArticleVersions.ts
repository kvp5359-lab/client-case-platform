"use client"

/**
 * Хук для работы с версиями статей базы знаний
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '../queryKeys'
import {
  getArticleVersionHistory,
  getArticleVersion,
  createArticleVersion,
  restoreArticleVersion,
} from '@/services/api/knowledge/knowledgeBaseService'

export function useArticleVersions(articleId: string | undefined, enabled = false) {
  const queryClient = useQueryClient()

  const versionsQuery = useQuery({
    queryKey: knowledgeBaseKeys.versions(articleId!),
    queryFn: () => getArticleVersionHistory(articleId!),
    enabled: !!articleId && enabled,
  })

  const createVersionMutation = useMutation({
    mutationFn: (comment?: string) => createArticleVersion(articleId!, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.versions(articleId!) })
    },
    onError: () => {
      toast.error('Не удалось создать версию')
    },
  })

  const restoreVersionMutation = useMutation({
    mutationFn: (versionId: string) => restoreArticleVersion(versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.versions(articleId!) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.article(articleId!) })
      toast.success('Версия восстановлена')
    },
    onError: () => {
      toast.error('Не удалось восстановить версию')
    },
  })

  return {
    versions: versionsQuery.data ?? [],
    isLoading: versionsQuery.isLoading,
    createVersion: createVersionMutation.mutateAsync,
    isCreating: createVersionMutation.isPending,
    restoreVersion: restoreVersionMutation.mutate,
    isRestoring: restoreVersionMutation.isPending,
  }
}

export function useArticleVersion(versionId: string | undefined) {
  return useQuery({
    queryKey: knowledgeBaseKeys.version(versionId!),
    queryFn: () => getArticleVersion(versionId!),
    enabled: !!versionId,
  })
}
