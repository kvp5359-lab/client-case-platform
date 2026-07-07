/**
 * Read-only хуки таксономии базы знаний (группы, теги, статусы статей).
 *
 * Отдельно от CRUD-хуков в page-components/KnowledgeBasePage — чтобы generic
 * фильтр-компоненты (src/components/filters) могли брать опции значений, не
 * импортируя из слоя page-components. Ключи те же, что у page-хуков, поэтому
 * React Query делит кэш — лишних запросов нет.
 */

import { useQuery } from '@tanstack/react-query'
import { knowledgeBaseKeys, statusKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'

export type KnowledgeTaxonomyOption = {
  id: string
  name: string
  color: string | null
}

export function useKnowledgeGroupsList(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('id, name, color, sort_order')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string; color: string | null; sort_order: number }>
    },
    enabled: enabled && !!workspaceId,
  })
}

export function useKnowledgeTagsList(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: knowledgeBaseKeys.tags(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_tags')
        .select('id, name, color, sort_order')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string; color: string | null; sort_order: number }>
    },
    enabled: enabled && !!workspaceId,
  })
}

export function useKnowledgeArticleStatusesList(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: statusKeys.knowledgeArticle(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('id, name, color, order_index')
        .eq('entity_type', 'knowledge_article')
        .eq('workspace_id', workspaceId!)
        .order('order_index')
      if (error) throw error
      return (data ?? []) as Array<{ id: string; name: string; color: string | null; order_index: number }>
    },
    enabled: enabled && !!workspaceId,
  })
}
