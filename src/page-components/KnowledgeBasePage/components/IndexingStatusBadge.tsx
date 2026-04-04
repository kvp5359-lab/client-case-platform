/**
 * Unified indexing status icon for articles and QA items.
 *
 * variant="article" — used in tree view / table rows for articles
 *   indexed → hidden, pending/processing → spinner, error → alert, default → DatabaseZap
 *
 * variant="qa" — used in QA table
 *   indexed → green check, indexing → blue spinner, error → red alert, default → gray clock
 */

import { CheckCircle2, Clock, AlertCircle, Loader2, CircleDashed, DatabaseZap } from 'lucide-react'

interface IndexingStatusBadgeProps {
  status: string | null | undefined
  variant?: 'article' | 'qa'
}

export function IndexingStatusBadge({ status, variant = 'article' }: IndexingStatusBadgeProps) {
  if (variant === 'qa') {
    switch (status) {
      case 'indexed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'indexing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  // variant === 'article'
  if (status === 'indexed') return null
  if (status === 'pending' || status === 'processing') {
    return (
      <CircleDashed
        className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 animate-spin"
        title="Индексируется..."
      />
    )
  }
  if (status === 'error') {
    return (
      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" title="Ошибка индексации" />
    )
  }
  // none or null — not indexed
  return (
    <DatabaseZap
      className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0"
      title="Не проиндексирована"
    />
  )
}
