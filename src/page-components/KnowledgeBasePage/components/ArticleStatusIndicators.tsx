import { Badge } from '@/components/ui/badge'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { TreeArticle } from './GroupTreeItem'
import { IndexingStatusBadge } from './IndexingStatusBadge'

// ---------- Article tags (shared) ----------

export function ArticleTags({ article }: { article: TreeArticle }) {
  return (
    <>
      {article.knowledge_article_tags?.map((at) =>
        at.knowledge_tags ? (
          <Badge
            key={at.tag_id}
            variant="outline"
            className="text-[10px] py-0 px-1 h-4 leading-none"
            style={{
              borderColor: at.knowledge_tags.color,
              color: at.knowledge_tags.color,
            }}
          >
            {at.knowledge_tags.name}
          </Badge>
        ) : null,
      )}
    </>
  )
}

// ---------- Read-only status indicator ----------

export function StatusDot({ article }: { article: TreeArticle }) {
  return (
    <div
      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: safeCssColor(article.statuses?.color) }}
      title={article.statuses?.name ?? 'Нет статуса'}
    />
  )
}

// ---------- Indexing status icon ----------
// Re-export unified component for backward compatibility

export function IndexingStatusIcon({ status }: { status: string | null | undefined }) {
  return <IndexingStatusBadge status={status} variant="article" />
}
