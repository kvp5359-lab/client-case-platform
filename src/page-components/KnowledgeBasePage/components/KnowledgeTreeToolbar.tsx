import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  FolderPlus,
  MoreVertical,
  RefreshCw,
  Loader2,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { KnowledgeSearchGroup } from '@/components/knowledge/KnowledgeSearchGroup'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

type KnowledgeTreeToolbarProps = {
  page: PageReturn
  showFilters: boolean
  onToggleFilters: () => void
  hasActiveFilters: boolean
  isReindexing: boolean
  onReindex: () => void
  allCollapsed: boolean
  onToggleCollapseAll: () => void
}

export function KnowledgeTreeToolbar({
  page,
  showFilters,
  onToggleFilters,
  hasActiveFilters,
  isReindexing,
  onReindex,
  allCollapsed,
  onToggleCollapseAll,
}: KnowledgeTreeToolbarProps) {
  return (
    <div className="flex items-center gap-3">
      <KnowledgeSearchGroup
        value={page.searchQuery}
        onChange={page.setSearchQuery}
        historyScope={`${page.workspaceId ?? 'ws'}:articles`}
        workspaceId={page.workspaceId}
        showFilters={showFilters}
        hasActiveFilters={hasActiveFilters}
        onToggleFilters={onToggleFilters}
      />
      {page.groups.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="min-w-[8rem]" // фикс-ширина: «Свернуть»/«Развернуть» разной длины, соседи не прыгают
          onClick={onToggleCollapseAll}
          title={allCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
        >
          {allCollapsed ? (
            <ChevronsUpDown className="w-4 h-4 mr-1.5" />
          ) : (
            <ChevronsDownUp className="w-4 h-4 mr-1.5" />
          )}
          {allCollapsed ? 'Развернуть' : 'Свернуть'}
        </Button>
      )}
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
