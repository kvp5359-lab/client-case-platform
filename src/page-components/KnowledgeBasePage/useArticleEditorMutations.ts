import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys, statusKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { TAG_COLOR_PALETTE } from '@/utils/notionPill'
import type { EditorKnowledgeArticle } from './useArticleEditor'

interface UseArticleEditorMutationsParams {
  articleId: string | undefined
  workspaceId: string | undefined
  setIsContentDirty: (dirty: boolean) => void
  setNewTagName: (name: string) => void
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>
  selectedTagIds: string[]
}

export function useArticleEditorMutations({
  articleId,
  workspaceId,
  setIsContentDirty,
  setNewTagName,
  setSelectedTagIds,
  selectedTagIds,
}: UseArticleEditorMutationsParams) {
  const queryClient = useQueryClient()

  const updateArticleMutation = useMutation({
    mutationFn: async (params: {
      title: string
      access_mode: 'read_only' | 'read_copy'
      status_id: string | null
    }) => {
      const { error } = await supabase
        .from('knowledge_articles')
        .update({
          title: params.title,
          access_mode: params.access_mode,
          status_id: params.status_id,
        })
        .eq('id', articleId!)
      if (error) throw error
    },
    onSuccess: (_data, params) => {
      // Update cache directly — avoids refetch overwriting local content
      queryClient.setQueryData(
        knowledgeBaseKeys.article(articleId!),
        (old: EditorKnowledgeArticle | undefined) =>
          old
            ? {
                ...old,
                title: params.title,
                access_mode: params.access_mode,
                status_id: params.status_id,
              }
            : old,
      )
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
      toast.success('Настройки сохранены')
    },
    onError: () => {
      toast.error('Не удалось сохранить настройки')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatusId: string | null) => {
      const { error } = await supabase
        .from('knowledge_articles')
        .update({ status_id: newStatusId })
        .eq('id', articleId!)
      if (error) throw error
    },
    onSuccess: (_data, newStatusId) => {
      queryClient.setQueryData(
        knowledgeBaseKeys.article(articleId!),
        (old: EditorKnowledgeArticle | undefined) =>
          old ? { ...old, status_id: newStatusId } : old,
      )
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось сменить статус')
    },
  })

  const updateContentMutation = useMutation({
    mutationFn: async (newContent: string) => {
      const { error } = await supabase
        .from('knowledge_articles')
        .update({ content: newContent })
        .eq('id', articleId!)
      if (error) throw error
    },
    onSuccess: (_data, savedContent) => {
      setIsContentDirty(false)
      // Update cache directly instead of refetching — avoids overwriting local title/accessMode
      queryClient.setQueryData(
        knowledgeBaseKeys.article(articleId!),
        (old: EditorKnowledgeArticle | undefined) =>
          old ? { ...old, content: savedContent } : old,
      )
    },
    onError: () => {
      toast.error('Не удалось сохранить контент')
    },
  })

  const updateGroupsMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      // B-88: атомарное обновление через RPC
      const { error } = await supabase.rpc('update_article_groups', {
        p_article_id: articleId!,
        p_group_ids: groupIds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articleGroups(articleId!) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось обновить группы')
    },
  })

  const updateTagsMutation = useMutation({
    mutationFn: async (tagIds: string[]) => {
      // B-88: атомарное обновление через RPC
      const { error } = await supabase.rpc('update_article_tags', {
        p_article_id: articleId!,
        p_tag_ids: tagIds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', 'article-tags', articleId] })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.articles(workspaceId!) })
    },
    onError: () => {
      toast.error('Не удалось обновить теги')
    },
  })

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const color = TAG_COLOR_PALETTE[Math.floor(Math.random() * TAG_COLOR_PALETTE.length)]
      const { data, error } = await supabase
        .from('knowledge_tags')
        .insert({ workspace_id: workspaceId!, name, color })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.tags(workspaceId!) })
      setNewTagName('')
      const newTagIds = [...selectedTagIds, data.id]
      setSelectedTagIds(newTagIds)
      updateTagsMutation.mutate(newTagIds)
    },
    onError: () => {
      toast.error('Не удалось создать тег')
    },
  })

  return {
    updateArticleMutation,
    updateStatusMutation,
    updateContentMutation,
    updateGroupsMutation,
    updateTagsMutation,
    createTagMutation,
  }
}
