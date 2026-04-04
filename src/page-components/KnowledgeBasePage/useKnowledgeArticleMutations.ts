/**
 * useKnowledgeArticleMutations — CRUD мутации для статей базы знаний.
 * Вынесено из useKnowledgeBasePage для уменьшения размера координатора.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'

export function useKnowledgeArticleMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const router = useRouter()

  const createArticleMutation = useMutation({
    mutationFn: async (groupId?: string) => {
      // Z5-03: атомарное создание через RPC
      const { data, error } = await supabase.rpc('create_article_with_group', {
        p_workspace_id: workspaceId!,
        p_group_id: groupId || null,
      })
      if (error) throw error
      return { id: data as string }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
      router.push(`/workspaces/${workspaceId}/settings/knowledge-base/${data.id}`)
    },
    onError: () => {
      toast.error('Не удалось создать статью')
    },
  })

  const deleteArticleMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const { error } = await supabase.from('knowledge_articles').delete().eq('id', articleId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
      toast.success('Статья удалена')
    },
    onError: () => {
      toast.error('Не удалось удалить статью')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ articleId, statusId }: { articleId: string; statusId: string | null }) => {
      const { error } = await supabase
        .from('knowledge_articles')
        .update({ status_id: statusId })
        .eq('id', articleId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось обновить статус')
    },
  })

  const updateArticleGroupsMutation = useMutation({
    mutationFn: async ({ articleId, groupIds }: { articleId: string; groupIds: string[] }) => {
      // B-88: атомарное обновление через RPC
      const { error } = await supabase.rpc('update_article_groups', {
        p_article_id: articleId,
        p_group_ids: groupIds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось обновить группы')
    },
  })

  const updateArticleTagsMutation = useMutation({
    mutationFn: async ({ articleId, tagIds }: { articleId: string; tagIds: string[] }) => {
      // B-88: атомарное обновление через RPC
      const { error } = await supabase.rpc('update_article_tags', {
        p_article_id: articleId,
        p_tag_ids: tagIds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось обновить теги')
    },
  })

  const moveArticleToGroupMutation = useMutation({
    mutationFn: async ({
      articleId,
      fromGroupId,
      toGroupId,
    }: {
      articleId: string
      fromGroupId: string | null
      toGroupId: string | null
    }) => {
      // Z5-02: атомарное перемещение через RPC
      const { error } = await supabase.rpc('move_article_to_group', {
        p_article_id: articleId,
        p_from_group_id: fromGroupId,
        p_to_group_id: toGroupId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
      toast.success('Статья перемещена')
    },
    onError: () => {
      toast.error('Не удалось переместить статью')
    },
  })

  const reorderArticlesMutation = useMutation({
    mutationFn: async ({ groupId, articleIds }: { groupId: string; articleIds: string[] }) => {
      const updates = articleIds.map((articleId, index) =>
        supabase
          .from('knowledge_article_groups')
          .update({ sort_order: index })
          .eq('article_id', articleId)
          .eq('group_id', groupId),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось сохранить порядок')
    },
  })

  return {
    createArticleMutation,
    deleteArticleMutation,
    updateStatusMutation,
    updateArticleGroupsMutation,
    updateArticleTagsMutation,
    moveArticleToGroupMutation,
    reorderArticlesMutation,
  }
}
