/**
 * ViewTabMenu — меню управления сохранённым представлением (стрелка ⌄ у
 * активной вкладки-представления): переименование, смена вида (дерево/таблица),
 * удаление. Заменяет прежний блок управления в панели фильтра.
 */

import { useState } from 'react'
import { ChevronDown, Check, Trash2, TreePine, TableProperties, SlidersHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { EMPTY_FILTER_GROUP } from '@/lib/filters/types'
import type { KnowledgeArticleView } from '@/hooks/knowledge/useKnowledgeArticleViews'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function ViewTabMenu({ view, page }: { view: KnowledgeArticleView; page: PageReturn }) {
  const [name, setName] = useState(view.name)

  const commitName = () => {
    const next = name.trim()
    if (next && next !== view.name) page.updateView.mutate({ id: view.id, name: next })
  }

  const setMode = (mode: 'tree' | 'table') => {
    if (view.view_mode !== mode) page.updateView.mutate({ id: view.id, viewMode: mode })
  }

  const handleDelete = () => {
    page.deleteView.mutate(view.id, {
      onSuccess: () => {
        page.setActiveViewId(null)
        page.clearQuickFilters()
        page.setAdvancedFilter(EMPTY_FILTER_GROUP)
      },
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-7 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Настройки представления"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="p-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="h-8 text-sm"
            placeholder="Название представления"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => page.setShowFilters(true)} className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Настроить фильтр
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setMode('tree')} className="gap-2">
          <TreePine className="h-4 w-4" />
          <span className="flex-1">Дерево</span>
          {view.view_mode === 'tree' && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setMode('table')} className="gap-2">
          <TableProperties className="h-4 w-4" />
          <span className="flex-1">Таблица</span>
          {view.view_mode === 'table' && <Check className="h-3.5 w-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Удалить представление
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
