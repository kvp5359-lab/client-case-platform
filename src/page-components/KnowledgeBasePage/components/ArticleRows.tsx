import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { StatusDropdown } from '@/components/common/status-dropdown'
import { GripVertical, Pencil, Trash2, Link2 } from 'lucide-react'
import { TemplateAccessButton } from '@/components/knowledge/template-access/TemplateAccessButton'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { KnowledgeArticle, useKnowledgeBasePage } from '../useKnowledgeBasePage'
import { INDENT, BASE_PAD, ARTICLE_EXTRA } from '@/components/shared/tree/TreeConstants'
import { TreeConnector } from '@/components/shared/tree/TreeConnector'
import { ArticleTags, IndexingStatusIcon, StatusDot } from './ArticleStatusIndicators'
import type { TreeArticle } from './TreeTypes'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

// ---------- Draggable + droppable article row (edit mode) ----------

export function SortableArticleRow({
  article,
  depth,
  page,
  isLast,
  dropIndicator,
  onArticleClick,
}: {
  article: KnowledgeArticle
  depth: number
  page: PageReturn
  isLast: boolean
  dropIndicator?: 'top' | 'bottom' | null
  onArticleClick: (article: KnowledgeArticle) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: article.id })

  const { setNodeRef: setDropRef } = useDroppable({ id: article.id })

  // Merge both refs
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node)
      setDropRef(node)
    },
    [setDragRef, setDropRef],
  )

  return (
    <div ref={mergedRef} className={`relative ${isDragging ? 'opacity-40' : ''}`}>
      {/* Blue line indicator */}
      {dropIndicator === 'top' && (
        <div className="absolute top-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {dropIndicator === 'bottom' && (
        <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10" />
      )}
      {depth > 0 && <TreeConnector depth={depth} isLast={isLast} />}
      <div
        className={`flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer ${
          dropIndicator ? 'bg-blue-50/40' : ''
        }`}
        style={{ paddingLeft: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA}px` }}
        onClick={() => onArticleClick(article)}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          style={{ left: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA - 14}px` }}
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
          <StatusDropdown
            currentStatus={article.statuses}
            statuses={page.statuses}
            onStatusChange={(statusId) =>
              page.updateStatusMutation.mutate({
                articleId: article.id,
                statusId,
              })
            }
            size="sm"
          />
        </div>
        <span className="flex items-center gap-1 flex-1 min-w-0">
          <span
            className={`text-base truncate ${!article.status_id ? 'text-muted-foreground/70' : ''}`}
          >
            {article.title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 flex-shrink-0 text-muted-foreground/30 hover:text-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            title="Редактировать"
            onClick={(e) => {
              e.stopPropagation()
              page.navigate(`/workspaces/${page.workspaceId}/knowledge-base/${article.id}`)
            }}
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </span>

        <ArticleTags article={article} />
        <IndexingStatusIcon status={(article as KnowledgeArticle).indexing_status} />
        <TemplateAccessButton
          entityId={article.id}
          entityType="article"
          workspaceId={page.workspaceId!}
        />

        <div
          className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            title="Удалить"
            onClick={() => page.handleDeleteArticle(article.id, article.title)}
          >
            <Trash2 className="w-3 h-3 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------- Non-sortable article row (for ungrouped, edit mode) ----------

export function ArticleRow({
  article,
  depth,
  page,
  isLast = false,
  onArticleClick,
}: {
  article: KnowledgeArticle
  depth: number
  page: PageReturn
  isLast?: boolean
  onArticleClick: (article: KnowledgeArticle) => void
}) {
  return (
    <div className="relative">
      {depth > 0 && <TreeConnector depth={depth} isLast={isLast} />}
      <div
        className="flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm group cursor-pointer"
        style={{ paddingLeft: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA}px` }}
        onClick={() => onArticleClick(article)}
      >
        <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
          <StatusDropdown
            currentStatus={article.statuses}
            statuses={page.statuses}
            onStatusChange={(statusId) =>
              page.updateStatusMutation.mutate({
                articleId: article.id,
                statusId,
              })
            }
            size="sm"
          />
        </div>
        <span className="flex items-center gap-1 flex-1 min-w-0">
          <span
            className={`text-base truncate ${!article.status_id ? 'text-muted-foreground/70' : ''}`}
          >
            {article.title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 flex-shrink-0 text-muted-foreground/30 hover:text-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            title="Редактировать"
            onClick={(e) => {
              e.stopPropagation()
              page.navigate(`/workspaces/${page.workspaceId}/knowledge-base/${article.id}`)
            }}
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </span>

        <ArticleTags article={article} />
        <IndexingStatusIcon status={article.indexing_status} />
        <TemplateAccessButton
          entityId={article.id}
          entityType="article"
          workspaceId={page.workspaceId!}
        />

        <div
          className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            title="Удалить"
            onClick={() => page.handleDeleteArticle(article.id, article.title)}
          >
            <Trash2 className="w-3 h-3 text-red-500" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------- Read-only article row ----------

export function ReadOnlyArticleRow({
  article,
  depth,
  isLast = false,
  onArticleClick,
  onCopyLink,
}: {
  article: TreeArticle
  depth: number
  isLast?: boolean
  onArticleClick: (article: TreeArticle) => void
  /** Если задан — по ховеру показывается иконка «скопировать ссылку для клиента». */
  onCopyLink?: (article: TreeArticle) => void
}) {
  return (
    <div className="relative">
      {depth > 0 && <TreeConnector depth={depth} isLast={isLast} />}
      <div
        className="group flex items-center gap-1.5 py-0.5 px-2 hover:bg-muted/50 rounded-sm cursor-pointer"
        style={{ paddingLeft: `${BASE_PAD + depth * INDENT + ARTICLE_EXTRA}px` }}
        onClick={() => onArticleClick(article)}
      >
        <StatusDot article={article} />
        <span
          className={`text-base truncate min-w-0 ${!article.status_id ? 'text-muted-foreground/70' : ''}`}
        >
          {article.title}
        </span>
        {onCopyLink && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCopyLink(article)
            }}
            title="Скопировать ссылку для клиента"
            aria-label="Скопировать ссылку для клиента"
            className="shrink-0 p-1 rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Распорка отталкивает тэги вправо — иконка остаётся у названия. */}
        <div className="flex-1" />
        <ArticleTags article={article} />
      </div>
    </div>
  )
}
