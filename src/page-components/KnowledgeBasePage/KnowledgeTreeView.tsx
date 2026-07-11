/**
 * KnowledgeTreeView — дерево групп и статей в единой плоскости.
 *
 * Группы работают как папки, статьи отображаются внутри них.
 * Статьи без группы показываются в конце.
 * Поддерживает drag & drop статей между группами.
 *
 * Подход: статическое дерево при перетаскивании (ничего не сдвигается),
 * голубая полоса показывает место вставки — как в документах.
 */

import { useCallback, useRef, useState } from 'react'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { useTrackRecentView } from '@/hooks/useGlobalSearch'
import { reindexAllArticles } from '@/services/api/knowledge/knowledgeSearchService'
import { toast } from 'sonner'
import { SortableArticleRow, ArticleRow } from './components/ArticleRows'
import { EditGroupDialog } from './components/EditGroupDialog'
import { KnowledgeFilterBar } from './components/KnowledgeFilterBar'
import { StatusDot } from './components/ArticleStatusIndicators'
import { KnowledgeTreeToolbar } from './components/KnowledgeTreeToolbar'
import { KnowledgeEmptyState } from './components/KnowledgeEmptyState'
import { GroupTreeBody } from '@/components/knowledge/tree/GroupTreeBody'
import type { TreeSource } from '@/components/knowledge/tree/types'
import type { useKnowledgeBasePage, KnowledgeArticle, KnowledgeGroup } from './useKnowledgeBasePage'
export type { DropIndicatorState } from './useKnowledgeTreeDnd'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function KnowledgeTreeView({ page }: { page: PageReturn }) {
  const [isReindexing, setIsReindexing] = useState(false)
  const layoutPanel = useLayoutTaskPanel()
  const { mutate: trackRecentView } = useTrackRecentView()
  // Открытие статьи KB в боковой панели через knowledge-scope (вариант A).
  const openArticleInPanel = useCallback(
    (article: KnowledgeArticle) => {
      if (!layoutPanel?.openKnowledgeArticleTab) return
      layoutPanel.openKnowledgeArticleTab(article.id, article.title)
      // Пишем в историю открытий (боковое окно editor-page не монтирует → сам трек)
      if (page.workspaceId) {
        trackRecentView({
          workspaceId: page.workspaceId,
          entityType: 'knowledge_article',
          entityId: article.id,
        })
      }
    },
    [layoutPanel, page.workspaceId, trackRecentView],
  )
  const isReindexingRef = useRef(false)
  const [editingGroup, setEditingGroup] = useState<KnowledgeGroup | null>(null)

  const handleReindex = useCallback(async () => {
    if (!page.workspaceId || isReindexingRef.current) return
    isReindexingRef.current = true
    setIsReindexing(true)
    const currentWorkspaceId = page.workspaceId
    try {
      let total = 0
      let remaining = Infinity
      const MAX_ITERATIONS = 100
      let iterations = 0
      while (remaining > 0 && iterations < MAX_ITERATIONS) {
        iterations++
        const result = await reindexAllArticles(currentWorkspaceId)
        total += result.reindexed
        remaining = result.remaining
      }
      toast.success(`Переиндексация завершена: ${total} статей`)
    } catch (err) {
      toast.error('Ошибка переиндексации', {
        description: (err as Error).message,
      })
    } finally {
      isReindexingRef.current = false
      setIsReindexing(false)
    }
  }, [page.workspaceId])

  const isLoading = page.articlesQuery.isLoading || page.groupsQuery.isLoading

  const isSearchActive =
    !!page.searchQuery ||
    page.filterTagIds.length > 0 ||
    page.filterGroupIds.length > 0 ||
    page.filterStatusIds.length > 0 ||
    page.advancedFilter.rules.length > 0

  /** Рекурсивно проверяет, есть ли в группе (или её потомках) хотя бы одна отфильтрованная статья */
  function groupHasMatches(groupId: string): boolean {
    if (page.getArticlesForGroup(groupId).length > 0) return true
    return page.groups.filter((g) => g.parent_id === groupId).some((c) => groupHasMatches(c.id))
  }

  const hasActiveFilters =
    page.filterTagIds.length > 0 ||
    page.filterGroupIds.length > 0 ||
    page.filterStatusIds.length > 0 ||
    page.advancedFilter.rules.length > 0

  // Адаптер общего дерева для статей
  const treeSource: TreeSource<KnowledgeArticle> = {
    workspaceId: page.workspaceId!,
    groups: page.groups,
    items: page.articles,
    getItemGroupId: (id) => {
      const a = page.articles.find((x) => x.id === id)
      return a && a.knowledge_article_groups.length > 0 ? a.knowledge_article_groups[0].group_id : null
    },
    getItemsForGroup: (groupId) => page.getArticlesForGroup(groupId),
    ungroupedItems: page.ungroupedArticles,
    moveItemToGroup: ({ itemId, fromGroupId, toGroupId }, opts) =>
      page.moveArticleToGroupMutation.mutate({ articleId: itemId, fromGroupId, toGroupId }, opts),
    reorderItems: ({ groupId, itemIds }) =>
      page.reorderArticlesMutation.mutate({ groupId, articleIds: itemIds }),
    addingGroupParentId: page.addingGroupParentId,
    setAddingGroupParentId: page.setAddingGroupParentId,
    newGroupName: page.newGroupName,
    setNewGroupName: page.setNewGroupName,
    onCreateGroup: page.handleCreateGroup,
    createGroupPending: page.createGroupMutation.isPending,
    onEditGroup: (g) => setEditingGroup(g as KnowledgeGroup),
    onDeleteGroup: (g) => page.handleDeleteGroup(g.id, g.name),
    onAddItem: (groupId) => page.createArticleMutation.mutate(groupId),
    addItemTitle: 'Добавить статью',
    renderItemRow: ({ item, depth, isLast, dropPosition }) =>
      depth === 0 ? (
        // «Без группы» — недрагируемая строка (как раньше)
        <ArticleRow
          key={item.id}
          article={item}
          depth={0}
          page={page}
          onArticleClick={openArticleInPanel}
        />
      ) : (
        <SortableArticleRow
          key={item.id}
          article={item}
          depth={depth}
          page={page}
          isLast={isLast}
          dropIndicator={dropPosition}
          onArticleClick={openArticleInPanel}
        />
      ),
    renderDragOverlay: (item) => (
      <div className="flex items-center gap-1.5 h-7 px-3 bg-background border rounded-md shadow-md text-sm">
        <StatusDot article={item} />
        <span className="truncate">{item.title}</span>
      </div>
    ),
    filterChildren: isSearchActive ? groupHasMatches : undefined,
    isSearchActive,
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <KnowledgeTreeToolbar
        page={page}
        showFilters={page.showFilters}
        onToggleFilters={() => page.setShowFilters((v) => !v)}
        hasActiveFilters={hasActiveFilters}
        isReindexing={isReindexing}
        onReindex={handleReindex}
      />

      {/* Строка фильтров (чипы статус/группа/тег + доп. поля + «+ Фильтр») */}
      {page.showFilters && <KnowledgeFilterBar page={page} />}

      {/* Tree */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : page.groups.length === 0 && page.articles.length === 0 ? (
        <KnowledgeEmptyState page={page} />
      ) : (
        <GroupTreeBody source={treeSource} />
      )}

      {/* Counter */}
      {!isLoading && page.articles.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {page.filteredArticles.length} из {page.articles.length} статей
          {page.groups.length > 0 && ` • ${page.groups.length} групп`}
        </div>
      )}

      {/* Edit group dialog */}
      <EditGroupDialog
        key={editingGroup?.id}
        group={editingGroup}
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
        groups={page.groups}
        updateGroup={page.updateGroupMutation.mutate}
        isSaving={page.updateGroupMutation.isPending}
      />
    </div>
  )
}
