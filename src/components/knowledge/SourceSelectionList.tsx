import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Bot, FileText, MessageCircleQuestion, Sparkles, X } from 'lucide-react'
import type { ArticleSource } from '@/services/api/knowledge/knowledgeSearchService'
import type { AccentColor } from './KnowledgeChatMessage'

const accentStyles: Record<AccentColor, { avatar: string; icon: string; button: string }> = {
  green: {
    avatar: 'bg-green-600/10',
    icon: 'text-green-600',
    button: 'bg-green-600 hover:bg-green-700 text-white',
  },
  orange: {
    avatar: 'bg-orange-500/10',
    icon: 'text-orange-500',
    button: 'bg-orange-500 hover:bg-orange-600 text-white',
  },
  blue: {
    avatar: 'bg-blue-500/10',
    icon: 'text-blue-500',
    button: 'bg-blue-500 hover:bg-blue-600 text-white',
  },
  purple: {
    avatar: 'bg-purple-600/10',
    icon: 'text-purple-600',
    button: 'bg-purple-600 hover:bg-purple-700 text-white',
  },
}

/** Get unique source ID — works for both articles and Q&A */
function getSourceId(source: ArticleSource): string {
  return source.article_id ?? source.qa_id ?? ''
}

interface SourceSelectionListProps {
  sources: ArticleSource[]
  selectedIds: Set<string>
  onToggle: (sourceId: string) => void
  onGenerate: () => void
  onDismiss: () => void
  accent?: AccentColor
}

export function SourceSelectionList({
  sources,
  selectedIds,
  onToggle,
  onGenerate,
  onDismiss,
  accent = 'green',
}: SourceSelectionListProps) {
  const colors = accentStyles[accent]
  const selectedCount = selectedIds.size

  return (
    <div className="flex gap-3 py-3">
      {/* Bot avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          colors.avatar,
        )}
      >
        <Sparkles className={cn('h-4 w-4', colors.icon)} />
      </div>

      {/* Source selection card */}
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-sm font-medium mb-3">
            Найдено {sources.length}{' '}
            {sources.length === 1 ? 'источник' : sources.length < 5 ? 'источника' : 'источников'}.
            Выберите источники для ответа:
          </p>

          <div className="space-y-1.5">
            {sources.map((source) => {
              const id = getSourceId(source)
              const isQA = source.source_type === 'qa'
              const Icon = isQA ? MessageCircleQuestion : FileText
              return (
                <label
                  key={id}
                  className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <Checkbox checked={selectedIds.has(id)} onCheckedChange={() => onToggle(id)} />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">
                    {source.article_title}
                    {isQA && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground font-medium uppercase">
                        Q&A
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {Math.round(source.similarity * 100)}%
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className={cn('h-8 gap-1.5', colors.button)}
            disabled={selectedCount === 0}
            onClick={onGenerate}
          >
            <Bot className="h-3.5 w-3.5" />
            Ответить ({selectedCount})
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onDismiss}>
            <X className="h-3.5 w-3.5" />
            Отмена
          </Button>
        </div>
      </div>
    </div>
  )
}
