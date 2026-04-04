/**
 * Бейдж статуса индексации статьи с кнопкой переиндексации.
 * Используется в KnowledgeBaseArticleEditorPage.
 */

import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertCircle, RefreshCw, DatabaseZap } from 'lucide-react'

interface IndexingBadgeProps {
  status: string | null | undefined
  isIndexing: boolean
  onReindex: () => void
}

export function IndexingBadge({ status, isIndexing, onReindex }: IndexingBadgeProps) {
  const effectiveStatus = isIndexing ? 'processing' : status

  let icon: React.ReactNode
  let label: string
  let className: string

  switch (effectiveStatus) {
    case 'indexed':
      icon = <CheckCircle2 className="w-3.5 h-3.5" />
      label = 'Индексирована'
      className = 'text-green-600 bg-green-50'
      break
    case 'pending':
    case 'processing':
      icon = <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      label = 'Индексация...'
      className = 'text-amber-600 bg-amber-50'
      break
    case 'error':
      icon = <AlertCircle className="w-3.5 h-3.5" />
      label = 'Ошибка'
      className = 'text-red-600 bg-red-50'
      break
    default:
      icon = <DatabaseZap className="w-3.5 h-3.5" />
      label = 'Не индексирована'
      className = 'text-muted-foreground bg-muted'
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <span
        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${className}`}
      >
        {icon}
        {label}
      </span>
      {effectiveStatus !== 'processing' && effectiveStatus !== 'pending' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          title="Переиндексировать"
          onClick={onReindex}
          disabled={isIndexing}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  )
}
