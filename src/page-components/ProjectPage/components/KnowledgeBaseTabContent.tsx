"use client"

/**
 * Содержимое вкладки "Полезные материалы"
 *
 * Загружает статьи, привязанные к шаблону проекта,
 * и отображает их в виде дерева групп (read-only).
 * Использует общие компоненты из GroupTreeItem.
 */

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { ensureArticleShareLink, buildShareUrl } from '@/services/api/shareLinks'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, BookOpen, Sparkles, X } from 'lucide-react'
import { PageLoader } from '@/components/ui/loaders'
import {
  ReadOnlyGroupTreeItem,
  ReadOnlyArticleRow,
  type TreeArticle,
  type TreeGroup,
} from '@/page-components/KnowledgeBasePage/components/GroupTreeItem'
import { FeatureGate } from '@/components/permissions/PermissionGate'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'

type KnowledgeBaseTabContentProps = {
  projectId: string
  workspaceId: string
  templateId: string | null
}

export function KnowledgeBaseTabContent({
  projectId,
  workspaceId,
  templateId,
}: KnowledgeBaseTabContentProps) {
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const openAI = useSidePanelStore((s) => s.openAI)
  const layoutPanel = useLayoutTaskPanel()

  // Открыть статью KB в боковой панели как отдельную вкладку.
  // Если контекст TaskPanel недоступен (например, страница без панели) —
  // тихо ничего не делаем; в проекте контекст всегда есть.
  const openArticle = useCallback(
    (article: TreeArticle) => {
      if (!layoutPanel?.openKnowledgeArticleTab) return
      layoutPanel.openKnowledgeArticleTab(article.id, article.title)
    },
    [layoutPanel],
  )

  const handleOpenAI = () => {
    openAI()
  }

  // Скопировать публичную ссылку на статью для клиента (тот же токен, что в
  // сборщике ⚡). Ссылка привязана к паре (статья, этот проект).
  const handleCopyLink = useCallback(
    async (article: TreeArticle) => {
      try {
        const token = await ensureArticleShareLink(article.id, projectId)
        await navigator.clipboard.writeText(buildShareUrl(token))
        toast.success('Ссылка скопирована')
      } catch {
        toast.error('Не удалось скопировать ссылку')
      }
    },
    [projectId],
  )

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Загружаем статьи через шаблон проекта
  const {
    data: articles = [],
    isLoading: isArticlesLoading,
    error,
  } = useQuery({
    queryKey: knowledgeBaseKeys.projectArticles(templateId!),
    queryFn: async () => {
      // Видимость статьи в проекте резолвится единой БД-функцией (та же логика,
      // что у бота): режим доступа сущности (наследует / везде / выбранные /
      // нигде) + каскад по вложенным группам.
      const { data: visibleRows, error: resolveError } = await supabase.rpc(
        'resolve_template_article_ids',
        { p_template_id: templateId! },
      )
      if (resolveError) throw resolveError

      const allArticleIds = (visibleRows || []).map((r) => r.article_id)
      if (allArticleIds.length === 0) return []

      // Загружаем статьи с группами, тегами и статусами
      const { data, error: articlesError } = await supabase
        .from('knowledge_articles')
        .select(
          `
          *,
          statuses(id, name, color),
          knowledge_article_groups(
            group_id,
            sort_order,
            knowledge_groups(id, name, sort_order, parent_id)
          ),
          knowledge_article_tags(
            tag_id,
            knowledge_tags(id, name, color)
          )
        `,
        )
        .in('id', allArticleIds)
        .eq('is_published', true)

      if (articlesError) throw articlesError
      return (data as TreeArticle[]) || []
    },
    enabled: !!templateId,
  })

  // Загружаем группы workspace (для полной иерархии)
  const { data: allGroups = [], isLoading: isGroupsLoading } = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId),
    queryFn: async () => {
      const { data, error: groupsError } = await supabase
        .from('knowledge_groups')
        .select('id, name, parent_id, sort_order')
        .eq('workspace_id', workspaceId)
        .order('sort_order')
        .order('name')
      if (groupsError) throw groupsError
      return (data || []) as TreeGroup[]
    },
    enabled: !!workspaceId,
  })

  // Фильтрация по поиску
  const filteredArticles = useMemo(() => {
    if (!search.trim()) return articles
    const q = search.toLowerCase().trim()
    return articles.filter((a) => a.title.toLowerCase().includes(q))
  }, [articles, search])

  // Плоская структура: только непосредственные группы статей (без иерархии родителей)
  const flatGroups = useMemo(() => {
    const groupIds = new Set<string>()
    for (const article of filteredArticles) {
      for (const ag of article.knowledge_article_groups) {
        groupIds.add(ag.group_id)
      }
    }
    return allGroups.filter((g) => groupIds.has(g.id))
  }, [filteredArticles, allGroups])

  const getArticlesForGroup = useCallback(
    (groupId: string) =>
      filteredArticles
        .filter((a) => a.knowledge_article_groups.some((ag) => ag.group_id === groupId))
        .sort((a, b) => {
          const aOrder =
            a.knowledge_article_groups.find((ag) => ag.group_id === groupId)?.sort_order ?? 0
          const bOrder =
            b.knowledge_article_groups.find((ag) => ag.group_id === groupId)?.sort_order ?? 0
          return aOrder - bOrder
        }),
    [filteredArticles],
  )

  const ungroupedArticles = useMemo(
    () => filteredArticles.filter((a) => a.knowledge_article_groups.length === 0),
    [filteredArticles],
  )

  const isLoading = isArticlesLoading || isGroupsLoading

  // Загрузка
  if (isLoading) {
    return <PageLoader />
  }

  // Ошибка
  if (error) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <p className="text-destructive">Ошибка загрузки материалов</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Попробуйте обновить страницу'}
          </p>
        </div>
      </div>
    )
  }

  // Нет шаблона или нет статей
  if (!templateId || articles.length === 0) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Полезные материалы</h3>
          <p className="text-muted-foreground mb-4">Полезные материалы пока не добавлены</p>
          <FeatureGate feature="ai_knowledge_search">
            <Button variant="outline" size="sm" onClick={handleOpenAI}>
              <Sparkles className="w-4 h-4 mr-1.5" />
              Спросить AI
            </Button>
          </FeatureGate>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Поиск + кнопка AI */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${search ? 'text-foreground' : 'text-muted-foreground'}`}
          />
          <Input
            placeholder="Поиск по материалам..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-9 ${search ? 'pr-8 border-primary border-2 ring-2 ring-primary/20 shadow-md shadow-primary/10' : ''}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <FeatureGate feature="ai_knowledge_search">
          <Button variant="outline" size="sm" onClick={handleOpenAI}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            Спросить AI
          </Button>
        </FeatureGate>
      </div>

      {/* Результаты поиска пусты */}
      {filteredArticles.length === 0 && search.trim() ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-muted-foreground">
            Ничего не найдено по запросу &laquo;{search}&raquo;
          </p>
        </div>
      ) : (
        <div className="border rounded-lg py-1">
          {flatGroups.map((group) => (
            <ReadOnlyGroupTreeItem
              key={group.id}
              group={group}
              groups={[]}
              depth={0}
              collapsedGroups={collapsedGroups}
              toggleCollapse={toggleCollapse}
              onArticleClick={openArticle}
              onCopyLink={handleCopyLink}
              getArticlesForGroup={getArticlesForGroup}
            />
          ))}

          {/* Ungrouped articles */}
          {ungroupedArticles.length > 0 && flatGroups.length > 0 && (
            <div className="border-t mt-1 pt-1">
              <div className="flex items-center gap-1.5 h-6 px-2 pl-[8px]">
                <span className="text-xs text-muted-foreground font-medium">Без группы</span>
              </div>
            </div>
          )}
          {ungroupedArticles.map((article, i) => (
            <ReadOnlyArticleRow
              key={article.id}
              article={article}
              depth={0}
              isLast={i === ungroupedArticles.length - 1}
              onArticleClick={openArticle}
              onCopyLink={handleCopyLink}
            />
          ))}
        </div>
      )}

      {/* Счётчик */}
      {articles.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {filteredArticles.length} из {articles.length} статей
        </div>
      )}

    </div>
  )
}
