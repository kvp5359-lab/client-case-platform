import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, FolderPlus, X, MoreVertical, RefreshCw, Loader2, Filter } from 'lucide-react'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

interface KnowledgeTreeToolbarProps {
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
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск статей..."
          className={`pl-9 transition-all ${page.searchQuery ? 'pr-8 !border-primary ring-2 ring-primary/50 shadow-[0_0_0_4px_hsl(47.9_95.8%_53.1%_/_0.2)]' : ''}`}
          value={page.searchQuery}
          onChange={(e) => page.setSearchQuery(e.target.value)}
        />
        {page.searchQuery && (
          <button
            type="button"
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => page.setSearchQuery('')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <Button
        size="sm"
        variant={showFilters || hasActiveFilters ? 'secondary' : 'outline'}
        className="w-8 h-8 p-0"
        onClick={onToggleFilters}
        title="Фильтр"
      >
        <Filter className="w-4 h-4" />
      </Button>
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
          <Button variant="ghost" size="icon" className="h-8 w-8">
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
