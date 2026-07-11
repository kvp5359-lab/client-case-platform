import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, FolderPlus, MoreVertical, RefreshCw, Loader2, Filter } from 'lucide-react'
import { KnowledgeSearchInput } from '@/components/knowledge/KnowledgeSearchInput'
import { ArticleHistoryButton } from '@/components/knowledge/ArticleHistoryButton'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

type KnowledgeTreeToolbarProps = {
  page: PageReturn
  showFilters: boolean
  onToggleFilters: () => void
  hasActiveFilters: boolean
  isReindexing: boolean
  onReindex: () => void
}

export function KnowledgeTreeToolbar({
  page,
  showFilters,
  onToggleFilters,
  hasActiveFilters,
  isReindexing,
  onReindex,
}: KnowledgeTreeToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <KnowledgeSearchInput
        value={page.searchQuery}
        onChange={page.setSearchQuery}
        historyScope={`${page.workspaceId ?? 'ws'}:articles`}
        placeholder="Поиск статей..."
        className="flex-1 min-w-[200px] max-w-sm"
        inputClassName={
          page.searchQuery
            ? 'transition-all !border-primary ring-2 ring-primary/50 shadow-[0_0_0_4px_hsl(47.9_95.8%_53.1%_/_0.2)]'
            : 'transition-all'
        }
      />
      <Button
        size="sm"
        variant={showFilters || hasActiveFilters ? 'secondary' : 'outline'}
        className="w-8 h-8 p-0"
        onClick={onToggleFilters}
        title="Фильтр"
      >
        <Filter className="w-4 h-4" />
      </Button>
      {page.workspaceId && <ArticleHistoryButton workspaceId={page.workspaceId} />}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          page.setAddingGroupParentId('root')
          page.setNewGroupName('')
        }}
      >
        <FolderPlus className="w-4 h-4 mr-1.5" />
        Группа
      </Button>
      <Button
        size="sm"
        onClick={() => page.createArticleMutation.mutate(undefined)}
        disabled={page.createArticleMutation.isPending}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Статья
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ещё действия">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onReindex} disabled={isReindexing}>
            {isReindexing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isReindexing ? 'Переиндексация...' : 'Переиндексировать все статьи'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
