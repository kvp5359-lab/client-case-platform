/**
 * useKnowledgeBasePage — координатор страницы «База знаний».
 *
 * Делегирует CRUD групп и тегов в sub-hooks:
 *   useKnowledgeGroups          — группы + editing state
 *   useKnowledgeTags            — теги
 *   useKnowledgeArticleMutations — CRUD мутации статей
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePersistentSearch } from '@/hooks/knowledge/useKnowledgeSearch'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys, statusKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { applyFilters } from '@/lib/filters/filterEngine'
import { EMPTY_FILTER_GROUP } from '@/lib/filters/types'
import type { FilterGroup, FilterContext } from '@/lib/filters/types'
import { useKnowledgeArticleViews } from '@/hooks/knowledge/useKnowledgeArticleViews'
import {
  knowledgeFieldAccessors,
  buildKnowledgeJunctionAccessors,
  buildCombinedFilter,
  parseFilterToChips,
} from './knowledgeArticleFilters'
import type { FilterCondition } from '@/lib/filters/types'

/** Каноническая сериализация (ключи по алфавиту) — стабильное сравнение
 *  фильтра с сохранённым в jsonb (Postgres не гарантирует порядок ключей). */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  const obj = v as Record<string, unknown>
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',') +
    '}'
  )
}
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
import type { KnowledgeArticle } from './useKnowledgeBasePage.types'

// ---------- Hook ----------

export function useKnowledgeBasePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Confirm dialog (for delete confirmations)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const { user } = useAuth()
  const currentUserId = user?.id ?? null

  // Search & filters
  const [searchQuery, setSearchQuery] = usePersistentSearch(`${workspaceId ?? 'ws'}:articles`)
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([])
  const [filterStatusIds, setFilterStatusIds] = useState<string[]>([])
  // Видимость строки фильтров — общая (открывается кнопкой в тулбаре или
  // пунктом меню представления), поэтому живёт в хуке, а не в Tree/Table.
  const [showFilters, setShowFilters] = useState(false)

  // Расширенный фильтр (движок src/lib/filters) + активное представление.
  const [advancedFilter, setAdvancedFilter] = useState<FilterGroup>(EMPTY_FILTER_GROUP)
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const viewsHook = useKnowledgeArticleViews(workspaceId)

  // Захват всего текущего состояния фильтрации (быстрые чипы + расширенный)
  // в единый FilterGroup — для сохранения нового представления через «+».
  const captureCurrentFilter = useCallback(
    () => buildCombinedFilter(filterStatusIds, filterGroupIds, filterTagIds, advancedFilter),
    [filterStatusIds, filterGroupIds, filterTagIds, advancedFilter],
  )

  const clearQuickFilters = useCallback(() => {
    setFilterStatusIds([])
    setFilterGroupIds([])
    setFilterTagIds([])
  }, [])

  // Применить фильтр представления: раскладываем единый FilterGroup обратно
  // на быстрые чипы + расширенный остаток (обратно к buildCombinedFilter).
  const applyViewFilter = useCallback((fc: FilterGroup) => {
    const p = parseFilterToChips(fc)
    setFilterStatusIds(p.statusIds)
    setFilterGroupIds(p.groupIds)
    setFilterTagIds(p.tagIds)
    setAdvancedFilter(p.advanced)
  }, [])

  // Доп. условия (поля кроме статус/группа/тег) — управление чипами «+ Фильтр».
  // Адресуем по индексу в advancedFilter.rules (стабильнее reference при правке).
  const addAdvancedCondition = useCallback((cond: FilterCondition) => {
    setAdvancedFilter((f) => ({ ...f, rules: [...f.rules, cond] }))
  }, [])
  const updateAdvancedCondition = useCallback((index: number, next: FilterCondition) => {
    setAdvancedFilter((f) => ({ ...f, rules: f.rules.map((r, i) => (i === index ? next : r)) }))
  }, [])
  const removeAdvancedCondition = useCallback((index: number) => {
    setAdvancedFilter((f) => ({ ...f, rules: f.rules.filter((_, i) => i !== index) }))
  }, [])

  // Автосохранение активного представления: любые правки фильтра (чипы +
  // доп. условия) пишутся в него с задержкой (как в Notion).
  const { views: viewsList, updateView } = viewsHook
  useEffect(() => {
    if (!activeViewId) return
    const view = viewsList.find((v) => v.id === activeViewId)
    if (!view) return
    const combined = buildCombinedFilter(filterStatusIds, filterGroupIds, filterTagIds, advancedFilter)
    if (stableStringify(combined) === stableStringify(view.filter_config)) return
    const t = setTimeout(() => {
      updateView.mutate({ id: activeViewId, filterConfig: combined })
    }, 700)
    return () => clearTimeout(t)
  }, [activeViewId, filterStatusIds, filterGroupIds, filterTagIds, advancedFilter, viewsList, updateView])

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

  // useMemo, чтобы || [] не создавал новый массив на каждом рендере и не
  // ломал мемоизацию filteredArticles ниже.
  const articles = useMemo(() => articlesQuery.data ?? [], [articlesQuery.data])
  const statuses = useMemo(() => statusesQuery.data ?? [], [statusesQuery.data])

  // Мемоизация: фильтрация перестаёт пересчитываться при рендерах, где выборки
  // не изменились. searchQuery.toLowerCase() теперь вычисляется один раз, а не на
  // каждую статью. filterTagIds/filterGroupIds/filterStatusIds конвертируем в Set
  // для O(1) поиска вместо O(n) includes.
  // Контекст и junction-аксессоры для расширенного фильтра (движок).
  const filterContext = useMemo<FilterContext>(
    () => ({ currentUserId, currentParticipantId: null, now: new Date() }),
    [currentUserId],
  )
  const junctionAccessors = useMemo(
    () => buildKnowledgeJunctionAccessors(articles),
    [articles],
  )

  const filteredArticles = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase()
    const tagSet = filterTagIds.length > 0 ? new Set(filterTagIds) : null
    const groupSet = filterGroupIds.length > 0 ? new Set(filterGroupIds) : null
    const statusSet = filterStatusIds.length > 0 ? new Set(filterStatusIds) : null

    // Быстрые чипы (поиск/статус/группа/тег) — дешёвая предфильтрация.
    // Сентинел '__none__' в наборе = «без статуса/группы/тега» (пусто).
    const quick = articles.filter((article) => {
      if (searchLower && !article.title.toLowerCase().includes(searchLower)) return false

      if (tagSet) {
        const wantNone = tagSet.has('__none__')
        const isEmpty = (article.knowledge_article_tags?.length ?? 0) === 0
        const hasReal = article.knowledge_article_tags?.some((at) => tagSet.has(at.tag_id)) ?? false
        if (!(hasReal || (wantNone && isEmpty))) return false
      }

      if (groupSet) {
        const wantNone = groupSet.has('__none__')
        const isEmpty = article.knowledge_article_groups.length === 0
        const hasReal = article.knowledge_article_groups.some((ag) => groupSet.has(ag.group_id))
        if (!(hasReal || (wantNone && isEmpty))) return false
      }

      if (statusSet) {
        const wantNone = statusSet.has('__none__')
        const hasReal = article.status_id != null && statusSet.has(article.status_id)
        if (!(hasReal || (wantNone && article.status_id == null))) return false
      }

      return true
    })

    // Расширенный фильтр (представления) — через общий движок поверх быстрых.
    if (advancedFilter.rules.length === 0) return quick
    return applyFilters(quick, advancedFilter, filterContext, knowledgeFieldAccessors, junctionAccessors)
  }, [articles, searchQuery, filterTagIds, filterGroupIds, filterStatusIds, advancedFilter, filterContext, junctionAccessors])

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
    // Расширенный фильтр + сохранённые представления
    advancedFilter,
    setAdvancedFilter,
    activeViewId,
    setActiveViewId,
    showFilters,
    setShowFilters,
    captureCurrentFilter,
    clearQuickFilters,
    applyViewFilter,
    addAdvancedCondition,
    updateAdvancedCondition,
    removeAdvancedCondition,
    ...viewsHook,
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
