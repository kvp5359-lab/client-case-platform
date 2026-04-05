/**
 * useKnowledgeBasePage — координатор страницы «База знаний».
 *
 * Делегирует CRUD групп и тегов в sub-hooks:
 *   useKnowledgeGroups          — группы + editing state
 *   useKnowledgeTags            — теги
 *   useKnowledgeArticleMutations — CRUD мутации статей
 */

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys, statusKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useKnowledgeGroups } from './useKnowledgeGroups'
import { useKnowledgeTags } from './useKnowledgeTags'
import { useKnowledgeArticleMutations } from './useKnowledgeArticleMutations'

// ---------- Types ----------
// Вынесены в useKnowledgeBasePage.types.ts, чтобы sibling-хуки
// (useKnowledgeGroups/useKnowledgeTags) могли их импортировать без цикла.
export type {
  KnowledgeGroup,
  KnowledgeTag,
  ArticleGroupJoin,
  ArticleTagJoin,
  KnowledgeArticleStatus,
  KnowledgeArticle,
} from './useKnowledgeBasePage.types'
import type {
  KnowledgeTag,
  ArticleGroupJoin,
  ArticleTagJoin,
  KnowledgeArticle,
} from './useKnowledgeBasePage.types'

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

  // Safety cap: Tree view должен видеть все статьи для группировки, но при 1000+
  // статьях это станет неподъёмным. limit(500) защищает от катастрофы — при его
  // достижении в консоль выводится предупреждение, чтобы мы вовремя перешли на
  // пагинацию/серверный поиск для table view.
  const ARTICLES_LIMIT = 500

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
        .limit(ARTICLES_LIMIT)
      if (error) throw error
      const rows = (data || []) as KnowledgeArticle[]
      if (rows.length >= ARTICLES_LIMIT) {
        // eslint-disable-next-line no-console
        console.warn(
          `[KnowledgeBase] Достигнут лимит загрузки статей (${ARTICLES_LIMIT}). ` +
            'Некоторые статьи не отображаются. Нужна пагинация/серверный поиск.',
        )
      }
      return rows
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

  // Мемоизация: фильтрация перестаёт пересчитываться при рендерах, где выборки
  // не изменились. searchQuery.toLowerCase() теперь вычисляется один раз, а не на
  // каждую статью. filterTagIds/filterGroupIds/filterStatusIds конвертируем в Set
  // для O(1) поиска вместо O(n) includes.
  const filteredArticles = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase()
    const tagSet = filterTagIds.length > 0 ? new Set(filterTagIds) : null
    const groupSet = filterGroupIds.length > 0 ? new Set(filterGroupIds) : null
    const statusSet = filterStatusIds.length > 0 ? new Set(filterStatusIds) : null

    return articles.filter((article) => {
      if (searchLower && !article.title.toLowerCase().includes(searchLower)) return false
      if (tagSet && !article.knowledge_article_tags?.some((at) => tagSet.has(at.tag_id)))
        return false
      if (groupSet && !article.knowledge_article_groups.some((ag) => groupSet.has(ag.group_id)))
        return false
      if (statusSet && (article.status_id == null || !statusSet.has(article.status_id)))
        return false
      return true
    })
  }, [articles, searchQuery, filterTagIds, filterGroupIds, filterStatusIds])

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

  const ungroupedArticles = useMemo(
    () => filteredArticles.filter((a) => a.knowledge_article_groups.length === 0),
    [filteredArticles],
  )

  return {
    workspaceId,
    navigate: router.push,
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
