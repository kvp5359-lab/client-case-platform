'use client'

/**
 * Группа «поиск + фильтр + история» базы знаний в единой рамке.
 * Используется в тулбарах дерева и таблицы статей.
 */

import { Button } from '@/components/ui/button'
import { Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KnowledgeSearchInput } from './KnowledgeSearchInput'
import { ArticleHistoryButton } from './ArticleHistoryButton'

export function KnowledgeSearchGroup({
  value,
  onChange,
  historyScope,
  placeholder = 'Поиск статей...',
  workspaceId,
  showFilters,
  hasActiveFilters,
  onToggleFilters,
  size = 'md',
}: {
  value: string
  onChange: (v: string) => void
  historyScope: string
  placeholder?: string
  workspaceId: string | undefined
  showFilters: boolean
  hasActiveFilters: boolean
  onToggleFilters: () => void
  /** md — под input h-9 (дерево), sm — под input h-8 (таблица) */
  size?: 'md' | 'sm'
}) {
  const btnHeight = size === 'md' ? 'h-9' : 'h-8'
  const hasHistory = !!workspaceId
  return (
    <div
      className={cn(
        'flex items-center flex-1 min-w-[200px] max-w-md rounded-md border bg-background transition-all',
        value
          ? '!border-primary ring-2 ring-primary/50 shadow-[0_0_0_4px_hsl(47.9_95.8%_53.1%_/_0.2)]'
          : 'focus-within:ring-1 focus-within:ring-ring',
      )}
    >
      <KnowledgeSearchInput
        value={value}
        onChange={onChange}
        historyScope={historyScope}
        placeholder={placeholder}
        className="flex-1 min-w-0"
        inputClassName={cn(
          'border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
          size === 'sm' && 'h-8 text-sm',
        )}
      />
      <div className="h-5 w-px bg-border shrink-0" />
      <Button
        size="sm"
        variant={showFilters || hasActiveFilters ? 'secondary' : 'ghost'}
        className={cn('w-8 p-0 shrink-0', btnHeight, hasHistory ? 'rounded-none' : 'rounded-l-none')}
        onClick={onToggleFilters}
        title="Фильтр"
      >
        <Filter className="w-4 h-4" />
      </Button>
      {hasHistory && (
        <ArticleHistoryButton
          workspaceId={workspaceId}
          triggerVariant="ghost"
          triggerClassName={cn('w-8 p-0 rounded-l-none shrink-0', btnHeight)}
        />
      )}
    </div>
  )
}
