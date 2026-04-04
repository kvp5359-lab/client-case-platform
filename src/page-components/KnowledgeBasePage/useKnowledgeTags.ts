/**
 * useKnowledgeTags — CRUD-операции для тегов базы знаний.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import type { KnowledgeTag } from './useKnowledgeBasePage'

export function useKnowledgeTags(
  workspaceId: string | undefined,
  setFilterTagIds: React.Dispatch<React.SetStateAction<string[]>>,
) {
  const queryClient = useQueryClient()

  const tagsQuery = useQuery({
    queryKey: knowledgeBaseKeys.tags(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_tags')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data || []) as KnowledgeTag[]
    },
    enabled: !!workspaceId,
  })

  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { error } = await supabase
        .from('knowledge_tags')
        .insert({ workspace_id: workspaceId!, name, color })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.tags(workspaceId!) })
      toast.success('Тег создан')
    },
    onError: () => {
      toast.error('Не удалось создать тег')
    },
  })

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (color !== undefined) updates.color = color
      const { error } = await supabase.from('knowledge_tags').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.tags(workspaceId!) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось обновить тег')
    },
  })

  const deleteTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase.from('knowledge_tags').delete().eq('id', tagId)
      if (error) throw error
    },
    onSuccess: (_data, deletedTagId) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.tags(workspaceId!) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
      setFilterTagIds((prev) => prev.filter((id) => id !== deletedTagId))
      toast.success('Тег удалён')
    },
    onError: () => {
      toast.error('Не удалось удалить тег')
    },
  })

  return {
    tags: tagsQuery.data || [],
    tagsQuery,
    createTagMutation,
    updateTagMutation,
    deleteTagMutation,
  }
}
