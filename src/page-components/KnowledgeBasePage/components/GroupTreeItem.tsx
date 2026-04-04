import { Button } from '@/components/ui/button'
import { Plus, Folder, FolderOpen, FolderPlus, Pencil, Trash2, LayoutTemplate } from 'lucide-react'
import { TemplateAccessPopover, TemplateAccessBadge } from './TemplateAccessPopover'
import { useDroppable } from '@dnd-kit/core'
import type {
  KnowledgeGroup,
  KnowledgeArticle,
  useKnowledgeBasePage,
} from '../useKnowledgeBasePage'
import type { DropIndicatorState } from '../KnowledgeTreeView'
import { INDENT, BASE_PAD, getLineX } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'
import { AddSubgroupInput } from '@/components/shared/tree/AddSubgroupInput'
import { SortableArticleRow, ArticleRow, ReadOnlyArticleRow } from './ArticleRows'

// Re-export extracted components so existing imports keep working
export { SortableArticleRow, ArticleRow, ReadOnlyArticleRow } from './ArticleRows'
export { ArticleTags, StatusDot, IndexingStatusIcon } from './ArticleStatusIndicators'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

// ---------- Shared types for readOnly mode ----------

export interface TreeArticle {
  id: string
  title: string
  content?: string | null
  access_mode?: string
  status_id?: string | null
  statuses?: { id: string; name: string; color: string } | null
  knowledge_article_groups: { group_id: string; sort_order: number }[]
  knowledge_article_tags?: {
    tag_id: string
    knowledge_tags: { id: string; name: string; color: string } | null
  }[]
}

export interface TreeGroup {
  id: string
  name: string
  parent_id: string | null
  sort_order?: number
  color?: string | null
}

// ---------- Group tree item ----------

export function GroupTreeItem({
  group,
  groups,
  depth,
  page,
  collapsedGroups,
  toggleCollapse,
  isLast = false,
  overGroupId,
  dropIndicator,
  onEditGroup,
  onArticleClick,
  filterChildren,
}: {
  group: KnowledgeGroup
  groups: KnowledgeGroup[]
  depth: number
  page: PageReturn
  collapsedGroups: Set<string>
  toggleCollapse: (id: string) => void
  isLast?: boolean
  overGroupId?: string | null
  dropIndicator?: DropIndicatorState | null
  onEditGroup: (group: KnowledgeGroup) => void
  onArticleClick: (article: KnowledgeArticle) => void
  filterChildren?: (groupId: string) => boolean
}) {
  const allChildren = groups.filter((g) => g.parent_id === group.id)
  const children = filterChildren ? allChildren.filter((c) => filterChildren(c.id)) : allChildren
  const articles = page.getArticlesForGroup(group.id)
  const hasContent = children.length > 0 || articles.length > 0
  const totalArticles = articles.length
  const isCollapsed = collapsedGroups.has(group.id)
  const isAddingChild = page.addingGroupParentId === group.id
  const isDropTarget = overGroupId === group.id

  const FolderIcon = isCollapsed ? Folder : FolderOpen

  // Make the group header a drop target
  const { setNodeRef } = useDroppable({ id: `group:${group.id}` })

  return (
    <div>
      {/* Group header row */}
      <div className="relative" ref={setNodeRef}>
        {depth > 0 && (
          <TreeConnector depth={depth} isLast={isLast && (!hasContent || isCollapsed)} />
        )}
        <div
          className={`flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer select-none transition-colors ${
            isDropTarget ? 'bg-primary/10 ring-1 ring-primary/30' : ''
          }`}
          style={{ paddingLeft: `${BASE_PAD + depth * INDENT}px` }}
          onClick={() => toggleCollapse(group.id)}
        >
          <FolderIcon
            className="w-4 h-4 flex-shrink-0"
            style={{ color: group.color || undefined }}
          />

          <span className="text-base font-semibold truncate">
            {group.name}
            {totalArticles > 0 && (
              <span className="text-muted-foreground font-normal ml-1">({totalArticles})</span>
            )}
          </span>
          {/* Кнопки рядом с названием: + и редактировать */}
          <div
            className="flex items-center gap-0.5 invisible group-hover:visible transition-all ml-1 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              title="Добавить статью"
              onClick={() => page.createArticleMutation.mutate(group.id)}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              title="Добавить подгруппу"
              onClick={() => {
                page.setAddingGroupParentId(group.id)
                page.setNewGroupName('')
              }}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
              title="Редактировать"
              onClick={() => onEditGroup(group)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex-1" />
          {/* Кнопки у правого края: доступ и удалить */}
          <div
            className="flex items-center gap-0.5 invisible group-hover:visible transition-all flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <TemplateAccessBadge entityId={group.id} entityType="group" />
            <TemplateAccessPopover
              entityId={group.id}
              entityType="group"
              workspaceId={page.workspaceId!}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted"
                title="Доступ для типов проектов"
              >
                <LayoutTemplate className="w-3 h-3" />
              </Button>
            </TemplateAccessPopover>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-destructive hover:bg-muted"
              title="Удалить"
              onClick={() => page.handleDeleteGroup(group.id, group.name)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Inline add subgroup */}
      {isAddingChild && (
        <AddSubgroupInput
          depth={depth}
          value={page.newGroupName}
          onChange={page.setNewGroupName}
          onSave={page.handleCreateGroup}
          onCancel={() => page.setAddingGroupParentId(null)}
          isSaving={page.createGroupMutation.isPending}
        />
      )}

      {/* Children: subgroups + sortable articles */}
      {!isCollapsed && hasContent && (
        <div className="relative">
          {/* Vertical continuation line from parent (pass-through for non-last siblings) */}
          {depth > 0 && !isLast && (
            <div
              className="absolute top-0 bottom-0 border-l border-border/50"
              style={{ left: `${getLineX(depth)}px` }}
            />
          )}
          {children.map((child, i) => {
            const isLastChild = i === children.length - 1 && articles.length === 0
            return (
              <GroupTreeItem
                key={child.id}
                group={child}
                groups={groups}
                depth={depth + 1}
                page={page}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                isLast={isLastChild}
                overGroupId={overGroupId}
                dropIndicator={dropIndicator}
                onEditGroup={onEditGroup}
                onArticleClick={onArticleClick}
                filterChildren={filterChildren}
              />
            )
          })}
          {articles.map((article, i) => (
            <SortableArticleRow
              key={article.id}
              article={article}
              depth={depth + 1}
              page={page}
              isLast={i === articles.length - 1}
              dropIndicator={
                dropIndicator?.articleId === article.id ? dropIndicator.position : null
              }
              onArticleClick={onArticleClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Read-only group tree item ----------

export function ReadOnlyGroupTreeItem({
  group,
  groups,
  depth,
  collapsedGroups,
  toggleCollapse,
  onArticleClick,
  getArticlesForGroup,
  isLast = false,
}: {
  group: TreeGroup
  groups: TreeGroup[]
  depth: number
  collapsedGroups: Set<string>
  toggleCollapse: (id: string) => void
  onArticleClick: (article: TreeArticle) => void
  getArticlesForGroup: (groupId: string) => TreeArticle[]
  isLast?: boolean
}) {
  const children = groups.filter((g) => g.parent_id === group.id)
  const groupArticles = getArticlesForGroup(group.id)
  const hasContent = children.length > 0 || groupArticles.length > 0
  const isCollapsed = collapsedGroups.has(group.id)

  const FolderIcon = isCollapsed ? Folder : FolderOpen

  return (
    <div>
      {/* Group header */}
      <div className="relative">
        {depth > 0 && (
          <TreeConnector depth={depth} isLast={isLast && (!hasContent || isCollapsed)} />
        )}
        <div
          className="flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm cursor-pointer select-none"
          style={{ paddingLeft: `${BASE_PAD + depth * INDENT}px` }}
          onClick={() => toggleCollapse(group.id)}
        >
          <FolderIcon
            className="w-4 h-4 flex-shrink-0"
            style={{ color: group.color || undefined }}
          />
          <span className="text-base font-semibold truncate flex-1">
            {group.name}
            {groupArticles.length > 0 && (
              <span className="text-muted-foreground font-normal ml-1">
                ({groupArticles.length})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Children */}
      {!isCollapsed && hasContent && (
        <div className="relative">
          {depth > 0 && !isLast && (
            <div
              className="absolute top-0 bottom-0 border-l border-border/50"
              style={{ left: `${getLineX(depth)}px` }}
            />
          )}
          {children.map((child, i) => {
            const isLastChild = i === children.length - 1 && groupArticles.length === 0
            return (
              <ReadOnlyGroupTreeItem
                key={child.id}
                group={child}
                groups={groups}
                depth={depth + 1}
                collapsedGroups={collapsedGroups}
                toggleCollapse={toggleCollapse}
                onArticleClick={onArticleClick}
                getArticlesForGroup={getArticlesForGroup}
                isLast={isLastChild}
              />
            )
          })}
          {groupArticles.map((article, i) => (
            <ReadOnlyArticleRow
              key={article.id}
              article={article}
              depth={depth + 1}
              isLast={i === groupArticles.length - 1}
              onArticleClick={onArticleClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
