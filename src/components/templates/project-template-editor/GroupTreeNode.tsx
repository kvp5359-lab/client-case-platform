/**
 * Рекурсивный узел дерева групп базы знаний.
 * Используется в AddKnowledgeDialog.
 */

import { Checkbox } from '@/components/ui/checkbox'
import { ChevronRight, Folder, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GroupNode {
  id: string
  name: string
  parentId: string | null
  articles: { id: string; title: string }[]
  children: GroupNode[]
}

interface GroupTreeNodeProps {
  node: GroupNode
  depth: number
  isLast: boolean
  expandedGroups: Set<string>
  selectedGroupIds: Set<string>
  selectedArticleIds: Set<string>
  linkedGroupIds: string[]
  linkedArticleIds: string[]
  onToggleExpand: (id: string) => void
  onToggleSelectGroup: (id: string) => void
  onToggleSelectArticle: (id: string) => void
  parentGroupSelected: boolean
}

export function GroupTreeNode({
  node,
  depth,
  isLast: _isLast,
  expandedGroups,
  selectedGroupIds,
  selectedArticleIds,
  linkedGroupIds,
  linkedArticleIds,
  onToggleExpand,
  onToggleSelectGroup,
  onToggleSelectArticle,
  parentGroupSelected,
}: GroupTreeNodeProps) {
  const isExpanded = expandedGroups.has(node.id)
  const isGroupSelected = selectedGroupIds.has(node.id)
  const isAlreadyLinked = linkedGroupIds.includes(node.id)
  const hasChildren = node.children.length > 0 || node.articles.length > 0
  const effectiveSelected = isGroupSelected || parentGroupSelected

  return (
    <div style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      {/* Group row */}
      <div
        className={cn(
          'flex items-center gap-1.5 h-7 px-1 rounded hover:bg-muted/50 cursor-pointer',
          isGroupSelected && !parentGroupSelected && 'bg-amber-50',
        )}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={cn('p-0.5 rounded shrink-0', hasChildren && 'hover:bg-muted')}
        >
          {hasChildren ? (
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
          ) : (
            <span className="w-3.5 h-3.5 block" />
          )}
        </button>
        <Checkbox
          checked={effectiveSelected}
          onCheckedChange={() => onToggleSelectGroup(node.id)}
          disabled={isAlreadyLinked || parentGroupSelected}
          className="shrink-0 h-3.5 w-3.5"
        />
        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span
          className={cn(
            'text-xs font-medium truncate',
            parentGroupSelected && 'text-muted-foreground',
          )}
        >
          {node.name}
        </span>
        {node.articles.length > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            ({node.articles.length})
          </span>
        )}
      </div>

      {/* Children: subgroups + articles */}
      {isExpanded && hasChildren && (
        <div className={cn('relative', depth >= 0 && 'ml-[11px] pl-3 border-l border-border/50')}>
          {/* Subgroups */}
          {node.children.map((child, idx) => {
            const isLastChild = idx === node.children.length - 1 && node.articles.length === 0

            return (
              <div key={child.id} className="relative">
                <TreeBranch isLast={isLastChild} />
                <GroupTreeNode
                  node={child}
                  depth={0}
                  isLast={isLastChild}
                  expandedGroups={expandedGroups}
                  selectedGroupIds={selectedGroupIds}
                  selectedArticleIds={selectedArticleIds}
                  linkedGroupIds={linkedGroupIds}
                  linkedArticleIds={linkedArticleIds}
                  onToggleExpand={onToggleExpand}
                  onToggleSelectGroup={onToggleSelectGroup}
                  onToggleSelectArticle={onToggleSelectArticle}
                  parentGroupSelected={effectiveSelected}
                />
              </div>
            )
          })}

          {/* Articles */}
          {node.articles.map((article, idx) => {
            const isLinked = linkedArticleIds.includes(article.id)
            const isSelected = selectedArticleIds.has(article.id)
            const isLastArticle = idx === node.articles.length - 1

            return (
              <div key={article.id} className="relative">
                <TreeBranch isLast={isLastArticle} />
                <label
                  className={cn(
                    'flex items-center gap-1.5 h-6 px-1 rounded hover:bg-muted/30 cursor-pointer',
                    isSelected && !effectiveSelected && 'bg-amber-50/50',
                  )}
                >
                  <Checkbox
                    checked={isSelected || effectiveSelected}
                    onCheckedChange={() => onToggleSelectArticle(article.id)}
                    disabled={isLinked || effectiveSelected}
                    className="shrink-0 h-3 w-3"
                  />
                  <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span
                    className={cn(
                      'text-[11px] truncate',
                      (isLinked || effectiveSelected) && 'text-muted-foreground',
                    )}
                  >
                    {article.title}
                  </span>
                  {isLinked && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 italic">
                      добавлена
                    </span>
                  )}
                </label>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Small tree branch connector (horizontal line from vertical tree line) */
function TreeBranch({ isLast }: { isLast: boolean }) {
  return (
    <>
      <div className="absolute left-[-12px] top-1/2 w-2.5 border-t border-border/50" />
      {isLast && <div className="absolute left-[-13px] top-1/2 bottom-0 w-[1px] bg-background" />}
    </>
  )
}
