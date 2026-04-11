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
import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, BookOpen, Loader2, Sparkles, X } from 'lucide-react'
import { KnowledgeBaseArticleView } from './KnowledgeBaseArticleView'
import {
  ReadOnlyGroupTreeItem,
  ReadOnlyArticleRow,
  type TreeArticle,
  type TreeGroup,
} from '@/page-components/KnowledgeBasePage/components/GroupTreeItem'
import { FeatureGate } from '@/components/permissions/PermissionGate'
import { useSidePanelStore } from '@/store/sidePanelStore'

interface KnowledgeBaseTabContentProps {
  projectId: string
  workspaceId: string
  templateId: string | null
}

export function KnowledgeBaseTabContent({
  projectId: _projectId,
  workspaceId,
  templateId,
}: KnowledgeBaseTabContentProps) {
  const [search, setSearch] = useState('')
  const [selectedArticle, setSelectedArticle] = useState<TreeArticle | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const openAI = useSidePanelStore((s) => s.openAI)

  const handleOpenAI = () => {
    openAI()
  }

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
      // 1. Получаем article_id из точечных привязок
      const { data: articleLinks, error: articleLinksError } = await supabase
        .from('knowledge_article_templates')
        .select('article_id')
        .eq('project_template_id', templateId!)

      if (articleLinksError) throw articleLinksError

      // 2. Получаем group_id из групповых привязок
      const { data: groupLinks, error: groupLinksError } = await supabase
        .from('knowledge_group_templates')
        .select('group_id')
        .eq('project_template_id', templateId!)

      if (groupLinksError) throw groupLinksError

      const directArticleIds = new Set((articleLinks || []).map((l) => l.article_id))
      const linkedGroupIds = (groupLinks || []).map((l) => l.group_id)

      // 3. Если есть группы — загружаем article_id из knowledge_article_groups
      if (linkedGroupIds.length > 0) {
        const { data: groupArticles, error: gaError } = await supabase
          .from('knowledge_article_groups')
          .select('article_id')
          .in('group_id', linkedGroupIds)

        if (gaError) throw gaError
        for (const ga of groupArticles || []) {
          directArticleIds.add(ga.article_id)
        }
      }

      const allArticleIds = [...directArticleIds]
      if (allArticleIds.length === 0) return []

      // 4. Загружаем статьи с группами, тегами и статусами
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
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
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
              onArticleClick={setSelectedArticle}
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
              onArticleClick={setSelectedArticle}
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

      {/* Просмотр статьи */}
      <KnowledgeBaseArticleView
        article={selectedArticle}
        open={!!selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
    </div>
  )
}
