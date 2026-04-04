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

import { useState, useCallback, useRef } from 'react'
import { KnowledgeBaseArticleView } from '@/page-components/ProjectPage/components/KnowledgeBaseArticleView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderPlus, Check, X } from 'lucide-react'
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core'
import { reindexAllArticles } from '@/services/api/knowledgeSearchService'
import { toast } from 'sonner'
import { GroupTreeItem, ArticleRow } from './components/GroupTreeItem'
import { EditGroupDialog } from './components/EditGroupDialog'
import { NotionFilterRow } from './components/NotionFilterRow'
import { StatusDot } from './components/ArticleStatusIndicators'
import { KnowledgeTreeToolbar } from './components/KnowledgeTreeToolbar'
import { UngroupedDropZone } from './components/UngroupedDropZone'
import { KnowledgeEmptyState } from './components/KnowledgeEmptyState'
import type { useKnowledgeBasePage, KnowledgeArticle, KnowledgeGroup } from './useKnowledgeBasePage'
import { useKnowledgeTreeDnd, UNGROUPED_ID } from './useKnowledgeTreeDnd'
export type { DropIndicatorState } from './useKnowledgeTreeDnd'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function KnowledgeTreeView({ page }: { page: PageReturn }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [previewArticle, setPreviewArticle] = useState<KnowledgeArticle | null>(null)
  const [isReindexing, setIsReindexing] = useState(false)
  const isReindexingRef = useRef(false)
  const [editingGroup, setEditingGroup] = useState<KnowledgeGroup | null>(null)

  // Z5-05: drag & drop логика вынесена в хук
  const dnd = useKnowledgeTreeDnd(page)

  const toggleCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const rootGroups = page.groups.filter((g) => !g.parent_id)
  const isLoading = page.articlesQuery.isLoading || page.groupsQuery.isLoading

  const isSearchActive =
    !!page.searchQuery ||
    page.filterTagIds.length > 0 ||
    page.filterGroupIds.length > 0 ||
    page.filterStatusIds.length > 0

  /** Рекурсивно проверяет, есть ли в группе (или её потомках) хотя бы одна отфильтрованная статья */
  function groupHasMatches(groupId: string): boolean {
    if (page.getArticlesForGroup(groupId).length > 0) return true
    return page.groups.filter((g) => g.parent_id === groupId).some((c) => groupHasMatches(c.id))
  }

  const visibleRootGroups = isSearchActive
    ? rootGroups.filter((g) => groupHasMatches(g.id))
    : rootGroups
  const hasActiveFilters =
    page.filterTagIds.length > 0 ||
    page.filterGroupIds.length > 0 ||
    page.filterStatusIds.length > 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <KnowledgeTreeToolbar
        page={page}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        hasActiveFilters={hasActiveFilters}
        isReindexing={isReindexing}
        onReindex={handleReindex}
      />

      {/* Notion-style filter bar */}
      {showFilters && (
        <NotionFilterRow
          status={{
            selectedIds: page.filterStatusIds,
            onToggle: (id) =>
              page.setFilterStatusIds((prev: string[]) =>
                prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
              ),
            onClear: () => page.setFilterStatusIds([]),
            options: page.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color })),
          }}
          group={{
            selectedIds: page.filterGroupIds,
            onToggle: (id) =>
              page.setFilterGroupIds((prev: string[]) =>
                prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
              ),
            onClear: () => page.setFilterGroupIds([]),
            options: page.groups.map((g) => ({ id: g.id, name: g.name })),
            treeGroups: page.groups,
          }}
          tag={{
            selectedIds: page.filterTagIds,
            onToggle: (id) =>
              page.setFilterTagIds((prev: string[]) =>
                prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
              ),
            onClear: () => page.setFilterTagIds([]),
            options: page.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
          }}
        />
      )}

      {/* Tree */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : page.groups.length === 0 && page.articles.length === 0 ? (
        <KnowledgeEmptyState page={page} />
      ) : (
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={pointerWithin}
          onDragStart={dnd.handleDragStart}
          onDragOver={dnd.handleDragOver}
          onDragEnd={dnd.handleDragEnd}
          onDragCancel={dnd.handleDragCancel}
        >
          <div className="border rounded-lg py-1">
            {/* Inline add root group */}
            {page.addingGroupParentId === 'root' && (
              <div className="flex items-center gap-1.5 h-7 px-2" style={{ paddingLeft: '8px' }}>
                <FolderPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Input
                  value={page.newGroupName}
                  onChange={(e) => page.setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') page.handleCreateGroup()
                    if (e.key === 'Escape') page.setAddingGroupParentId(null)
                  }}
                  placeholder="Название группы..."
                  className="h-6 text-sm flex-1"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={page.handleCreateGroup}
                  disabled={!page.newGroupName.trim() || page.createGroupMutation.isPending}
                  className="h-6 w-6 p-0"
                >
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => page.setAddingGroupParentId(null)}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Root groups */}
            {visibleRootGroups.map((group) => (
              <GroupTreeItem
                key={group.id}
                group={group}
                groups={page.groups}
                depth={0}
                page={page}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                overGroupId={dnd.overGroupId}
                dropIndicator={dnd.dropIndicator}
                onEditGroup={setEditingGroup}
                onArticleClick={setPreviewArticle}
                filterChildren={isSearchActive ? groupHasMatches : undefined}
              />
            ))}

            {/* Ungrouped articles */}
            {(page.ungroupedArticles.length > 0 || dnd.activeArticle) && rootGroups.length > 0 && (
              <UngroupedDropZone isOver={dnd.overGroupId === UNGROUPED_ID}>
                <div className="border-t mt-1 pt-1">
                  <div className="flex items-center gap-1.5 h-6 px-2 pl-[8px]">
                    <span className="text-xs text-muted-foreground font-medium">Без группы</span>
                  </div>
                </div>
                {page.ungroupedArticles.map((article) => (
                  <ArticleRow
                    key={article.id}
                    article={article}
                    depth={0}
                    page={page}
                    onArticleClick={setPreviewArticle}
                  />
                ))}
              </UngroupedDropZone>
            )}
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {dnd.activeArticle && (
              <div className="flex items-center gap-1.5 h-7 px-3 bg-background border rounded-md shadow-md text-sm">
                <StatusDot article={dnd.activeArticle} />
                <span className="truncate">{dnd.activeArticle.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Counter */}
      {!isLoading && page.articles.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {page.filteredArticles.length} из {page.articles.length} статей
          {page.groups.length > 0 && ` • ${page.groups.length} групп`}
        </div>
      )}

      {/* Article preview dialog */}
      <KnowledgeBaseArticleView
        article={
          previewArticle
            ? {
                id: previewArticle.id,
                title: previewArticle.title,
                content: previewArticle.content ?? '',
                access_mode: previewArticle.access_mode,
              }
            : null
        }
        open={!!previewArticle}
        onClose={() => setPreviewArticle(null)}
      />

      {/* Edit group dialog */}
      <EditGroupDialog
        key={editingGroup?.id}
        group={editingGroup}
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
        page={page}
      />
    </div>
  )
}
