/**
 * useKnowledgeBasePage — координатор страницы «База знаний».
 *
 * Делегирует CRUD групп и тегов в sub-hooks:
 *   useKnowledgeGroups          — группы + editing state
 *   useKnowledgeTags            — теги
 *   useKnowledgeArticleMutations — CRUD мутации статей
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys, statusKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useKnowledgeGroups } from './useKnowledgeGroups'
import { useKnowledgeTags } from './useKnowledgeTags'
import { useKnowledgeArticleMutations } from './useKnowledgeArticleMutations'

// ---------- Types ----------

export interface KnowledgeGroup {
  id: string
  name: string
  color: string | null
  workspace_id: string
  parent_id: string | null
  sort_order: number
  created_at: string
}

export interface KnowledgeTag {
  id: string
  workspace_id: string
  name: string
  color: string
  sort_order: number
  created_at: string
}

export interface ArticleGroupJoin {
  group_id: string
  sort_order: number
  knowledge_groups: { id: string; name: string; color: string | null } | null
}

export interface ArticleTagJoin {
  tag_id: string
  knowledge_tags: { id: string; name: string; color: string } | null
}

export interface KnowledgeArticleStatus {
  id: string
  name: string
  color: string
}

export interface KnowledgeArticle {
  id: string
  workspace_id: string
  title: string
  content: string | null
  access_mode: 'read_only' | 'read_copy'
  is_published: boolean
  status_id: string | null
  statuses: KnowledgeArticleStatus | null
  created_by: string | null
  author_email: string | null
  author_name: string | null
  created_at: string
  updated_at: string
  indexing_status: string | null
  indexed_at: string | null
  knowledge_article_groups: ArticleGroupJoin[]
  knowledge_article_tags: ArticleTagJoin[]
}

// ---------- Hook ----------

export function useKnowledgeBasePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Confirm dialog (for delete confirmations)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([])
  const [filterStatusIds, setFilterStatusIds] = useState<string[]>([])

  // Backward compat: single-value setters for tree view
  const setFilterTagId = (id: string | null) => setFilterTagIds(id ? [id] : [])
  const setFilterGroupId = (id: string | null) => setFilterGroupIds(id ? [id] : [])
  const setFilterStatusId = (id: string | null) => setFilterStatusIds(id ? [id] : [])

  // --- Sub-hooks ---

  const groupsHook = useKnowledgeGroups(workspaceId)
  const tagsHook = useKnowledgeTags(workspaceId, setFilterTagIds)
  const articleMutations = useKnowledgeArticleMutations(workspaceId)

  // --- Queries ---

  const articlesQuery = useQuery({
    queryKey: knowledgeBaseKeys.articles(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select(
          `
          *,
          statuses(id, name, color),
          knowledge_article_groups(
            group_id,
            sort_order,
            knowledge_groups(id, name, color)
          ),
          knowledge_article_tags(
            tag_id,
            knowledge_tags(id, name, color)
          )
        `,
        )
        .eq('workspace_id', workspaceId!)
        .order('title')
      if (error) throw error
      return (data || []) as KnowledgeArticle[]
    },
    enabled: !!workspaceId,
  })

  const statusesQuery = useQuery({
    queryKey: statusKeys.knowledgeArticle(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('entity_type', 'knowledge_article')
        .eq('workspace_id', workspaceId!)
        .order('order_index')
      if (error) throw error
      return (data || []) as Array<{
        id: string
        name: string
        color: string
        order_index: number
        is_default: boolean
        is_final: boolean
      }>
    },
    enabled: !!workspaceId,
  })

  // --- Handlers ---

  const handleDeleteArticle = async (articleId: string, title: string) => {
    const ok = await confirm({
      title: 'Удалить статью?',
      description: `Статья "${title}" будет удалена. Это действие нельзя отменить.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    articleMutations.deleteArticleMutation.mutate(articleId)
  }

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    const ok = await confirm({
      title: 'Удалить группу?',
      description: `Группа "${groupName}" будет удалена. Статьи из неё не удалятся, только связь.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    groupsHook.deleteGroupMutation.mutate(groupId)
  }

  // --- Filtering ---

  const articles = articlesQuery.data || []
  const statuses = statusesQuery.data || []

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      !searchQuery || article.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTag =
      filterTagIds.length === 0 ||
      article.knowledge_article_tags?.some((at) => filterTagIds.includes(at.tag_id))
    const matchesGroup =
      filterGroupIds.length === 0 ||
      article.knowledge_article_groups.some((ag) => filterGroupIds.includes(ag.group_id))
    const matchesStatus =
      filterStatusIds.length === 0 ||
      (article.status_id != null && filterStatusIds.includes(article.status_id))
    return matchesSearch && matchesTag && matchesGroup && matchesStatus
  })

  const getArticlesForGroup = (groupId: string) =>
    filteredArticles
      .filter((a) => a.knowledge_article_groups.some((ag) => ag.group_id === groupId))
      .sort((a, b) => {
        const aOrder =
          a.knowledge_article_groups.find((ag) => ag.group_id === groupId)?.sort_order ?? 0
        const bOrder =
          b.knowledge_article_groups.find((ag) => ag.group_id === groupId)?.sort_order ?? 0
        return aOrder - bOrder
      })

  const ungroupedArticles = filteredArticles.filter((a) => a.knowledge_article_groups.length === 0)

  return {
    workspaceId,
    navigate,
    queryClient,
    // Search & filter
    searchQuery,
    setSearchQuery,
    // Multi-value filters
    filterTagIds,
    setFilterTagIds,
    filterGroupIds,
    setFilterGroupIds,
    filterStatusIds,
    setFilterStatusIds,
    // Single-value compat (tree view)
    filterTagId: filterTagIds[0] ?? null,
    setFilterTagId,
    filterGroupId: filterGroupIds[0] ?? null,
    setFilterGroupId,
    filterStatusId: filterStatusIds[0] ?? null,
    setFilterStatusId,
    // Articles
    articlesQuery,
    articles,
    filteredArticles,
    getArticlesForGroup,
    ungroupedArticles,
    handleDeleteArticle,
    // Article mutations (from sub-hook)
    ...articleMutations,
    // Statuses
    statuses,
    statusesQuery,
    // Groups (from sub-hook)
    ...groupsHook,
    handleDeleteGroup,
    // Tags (from sub-hook)
    ...tagsHook,
    // Confirm dialog props (render ConfirmDialog in parent component)
    confirmDialogProps: { state: confirmState, onConfirm: handleConfirm, onCancel: handleCancel },
  }
}
