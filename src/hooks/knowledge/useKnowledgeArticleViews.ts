/**
 * useKnowledgeArticleViews — CRUD сохранённых представлений базы знаний.
 *
 * Представление = именованный набор фильтров (FilterGroup). Видимость:
 *   owner_user_id IS NULL   → общее (видят все, меняют управляющие БЗ),
 *   owner_user_id = user.id → личное.
 * Права на общие представления enforce'ятся RLS (см. миграцию
 * 20260707150000_knowledge_article_views.sql).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import type { FilterGroup } from '@/lib/filters/types'
import type { Json } from '@/types/database'

export type KnowledgeArticleViewMode = 'tree' | 'table'

export type KnowledgeArticleView = {
  id: string
  workspace_id: string
  owner_user_id: string | null
  name: string
  filter_config: FilterGroup
  view_mode: KnowledgeArticleViewMode
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
}

export function useKnowledgeArticleViews(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  const viewsQuery = useQuery({
    queryKey: knowledgeBaseKeys.views(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_article_views')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as KnowledgeArticleView[]
    },
    enabled: !!workspaceId,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.views(workspaceId!) })

  const createView = useMutation({
    mutationFn: async (params: {
      name: string
      filterConfig: FilterGroup
      shared: boolean
      viewMode: KnowledgeArticleViewMode
    }) => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userRes.user) throw new Error('Не авторизован')
      const uid = userRes.user.id
      const { data, error } = await supabase
        .from('knowledge_article_views')
        .insert({
          workspace_id: workspaceId!,
          owner_user_id: params.shared ? null : uid,
          created_by: uid,
          name: params.name.trim(),
          filter_config: params.filterConfig as unknown as Json,
          view_mode: params.viewMode,
        })
        .select()
        .single()
      if (error) throw error
      return data as unknown as KnowledgeArticleView
    },
    onSuccess: () => {
      invalidate()
      toast.success('Представление сохранено')
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить представление'),
  })

  const updateView = useMutation({
    mutationFn: async (params: {
      id: string
      name?: string
      filterConfig?: FilterGroup
      viewMode?: KnowledgeArticleViewMode
    }) => {
      const patch: Record<string, unknown> = {}
      if (params.name !== undefined) patch.name = params.name.trim()
      if (params.filterConfig !== undefined) patch.filter_config = params.filterConfig as unknown as Json
      if (params.viewMode !== undefined) patch.view_mode = params.viewMode
      const { error } = await supabase
        .from('knowledge_article_views')
        .update(patch)
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Представление обновлено')
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить представление'),
  })

  const deleteView = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('knowledge_article_views').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Представление удалено')
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить представление'),
  })

  return {
    viewsQuery,
    views: viewsQuery.data ?? [],
    createView,
    updateView,
    deleteView,
  }
}
