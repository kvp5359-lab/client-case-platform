"use client"

/**
 * Хук для загрузки списка диалогов AI-чата по базе знаний
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getConversations,
  deleteConversation,
  updateConversation,
} from '@/services/api/knowledge/knowledgeSearchService'
import { knowledgeBaseKeys } from '../queryKeys'

interface UseKnowledgeConversationsOptions {
  workspaceId: string
  projectId?: string
  enabled?: boolean
}

export function useKnowledgeConversations({
  workspaceId,
  projectId,
  enabled = true,
}: UseKnowledgeConversationsOptions) {
  const queryClient = useQueryClient()

  const conversationsQuery = useQuery({
    queryKey: knowledgeBaseKeys.conversations(workspaceId, projectId),
    queryFn: () => getConversations(workspaceId, projectId),
    enabled: enabled && !!workspaceId,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.conversations(workspaceId, projectId),
      })
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => updateConversation(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.conversations(workspaceId, projectId),
      })
    },
  })

  return {
    conversations: conversationsQuery.data ?? [],
    isLoading: conversationsQuery.isLoading,
    error: conversationsQuery.error,
    deleteConversation: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    renameConversation: renameMutation.mutate,
    isRenaming: renameMutation.isPending,
  }
}
