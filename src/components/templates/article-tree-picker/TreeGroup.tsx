import { BookOpen, Check, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { ArticleTreePickerGroup } from './types'

interface TreeGroupProps {
  group: ArticleTreePickerGroup
  depth: number
  mode: 'single-article' | 'single-group' | 'multiple-groups'
  selectedId: string | null
  isExpanded: boolean
  isGroupSelected: boolean
  isGroupVisible: (groupId: string) => boolean
  groupHasVisibleContent: (groupId: string) => boolean
  isArticleVisible: (article: { id: string; title: string }) => boolean
  getGroupArticles: (groupId: string) => Array<{ id: string; title: string }>
  childGroups: ArticleTreePickerGroup[]
  searchLower: string
  onToggle: (groupId: string) => void
  onSelectGroup: (groupId: string | null) => void
  onSelectArticle: (articleId: string) => void
  renderGroup: (group: ArticleTreePickerGroup, depth: number) => React.ReactNode
}

export function TreeGroup({
  group,
  depth,
  mode,
  selectedId,
  isExpanded,
  isGroupSelected,
  isGroupVisible,
  groupHasVisibleContent,
  isArticleVisible,
  getGroupArticles,
  childGroups,
  searchLower,
  onToggle,
  onSelectGroup,
  onSelectArticle,
  renderGroup,
}: TreeGroupProps) {
  if (!isGroupVisible(group.id)) return null
  if (searchLower && !groupHasVisibleContent(group.id)) return null

  const showArticles = mode === 'single-article'
  const isMultiple = mode === 'multiple-groups'
  const isGroupSelectable = mode === 'single-group' || mode === 'multiple-groups'

  const groupArticles = showArticles ? getGroupArticles(group.id).filter(isArticleVisible) : []
  const hasChildren = showArticles
    ? groupArticles.length > 0 || childGroups.some((c) => isGroupVisible(c.id))
    : childGroups.some((c) => isGroupVisible(c.id))

  return (
    <div key={group.id}>
      <div
        className={cn(
          'flex items-center gap-1.5 w-full px-2 py-1.5 text-sm rounded-sm',
          isGroupSelectable
            ? 'cursor-pointer hover:bg-accent'
            : 'text-muted-foreground/60 hover:bg-accent/50 cursor-pointer',
          isGroupSelectable && isGroupSelected && 'bg-accent',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => {
          if (isGroupSelectable) {
            onSelectGroup(group.id)
          } else {
            onToggle(group.id)
          }
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex-shrink-0 p-0 bg-transparent border-none"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(group.id)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            )}
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        {isMultiple && (
          <Checkbox
            checked={isGroupSelected}
            onCheckedChange={() => onSelectGroup(group.id)}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          />
        )}

        {mode === 'single-group' && (
          <span className="w-4 flex-shrink-0">
            {isGroupSelected && <Check className="h-4 w-4" />}
          </span>
        )}

        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
        <span className={cn('truncate', isGroupSelectable && 'font-medium')}>{group.name}</span>
      </div>

      {isExpanded && (
        <>
          {childGroups.map((child) => renderGroup(child, depth + 1))}
          {groupArticles.map((article) => (
            <button
              key={article.id}
              type="button"
              className={cn(
                'flex items-center gap-1.5 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent',
                article.id === selectedId && 'bg-accent font-medium',
              )}
              style={{ paddingLeft: `${24 + (depth + 1) * 16}px` }}
              onClick={() => onSelectArticle(article.id)}
            >
              <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70" />
              <span className="truncate">{article.title}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
