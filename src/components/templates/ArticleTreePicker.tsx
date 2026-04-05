/**
 * ArticleTreePicker — универсальный иерархический picker для базы знаний.
 *
 * Режимы:
 * - single-article (default): выбор одной статьи из дерева групп
 * - single-group: выбор одной группы (без статей)
 * - multiple-groups: множественный выбор групп с чекбоксами (без статей)
 *
 * Поддерживает поиск с автораскрытием групп.
 *
 * Используется внутри Dialog — Popover с modal={true} + pointer-events-auto
 * для корректной работы скролла и кликов (shadcn-ui/ui#3959).
 */

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BookOpen, ChevronDown, FolderOpen, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useArticleTreePicker } from './article-tree-picker/useArticleTreePicker'
import { TreeGroup } from './article-tree-picker/TreeGroup'

// Типы вынесены в ./article-tree-picker/types.ts — чтобы sub-модули не образовывали цикл
export type {
  ArticleTreePickerGroup,
  ArticleTreePickerLink,
} from './article-tree-picker/types'
import type {
  ArticleTreePickerGroup,
  ArticleTreePickerLink,
} from './article-tree-picker/types'

// --- Single article mode (original) ---
interface SingleArticleProps {
  mode?: 'single-article'
  articles: Array<{ id: string; title: string }>
  groups: ArticleTreePickerGroup[]
  articleGroups: ArticleTreePickerLink[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  selectedGroupIds?: never
  onToggleGroup?: never
  excludeGroupIds?: never
  emptyLabel?: string
  searchPlaceholder?: string
}

// --- Single group mode ---
interface SingleGroupProps {
  mode: 'single-group'
  groups: ArticleTreePickerGroup[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  excludeGroupIds?: Set<string>
  emptyLabel?: string
  searchPlaceholder?: string
  articles?: never
  articleGroups?: never
  selectedGroupIds?: never
  onToggleGroup?: never
}

// --- Multiple groups mode ---
interface MultipleGroupsProps {
  mode: 'multiple-groups'
  groups: ArticleTreePickerGroup[]
  selectedGroupIds: string[]
  onToggleGroup: (groupId: string) => void
  emptyLabel?: string
  searchPlaceholder?: string
  selectedId?: never
  onSelect?: never
  excludeGroupIds?: never
  articles?: never
  articleGroups?: never
}

type ArticleTreePickerProps = SingleArticleProps | SingleGroupProps | MultipleGroupsProps

export function ArticleTreePicker(props: ArticleTreePickerProps) {
  const { groups, emptyLabel, searchPlaceholder, mode = 'single-article' } = props

  const searchInputRef = useRef<HTMLInputElement>(null)

  const showArticles = mode === 'single-article'
  const isMultiple = mode === 'multiple-groups'
  const excludeGroupIds = (props as SingleGroupProps).excludeGroupIds

  const articles = showArticles ? (props as SingleArticleProps).articles : []
  const articleGroups = showArticles ? (props as SingleArticleProps).articleGroups : []

  const selectedId = !isMultiple
    ? (props as SingleArticleProps | SingleGroupProps).selectedId
    : null
  const selectedArticle =
    showArticles && selectedId ? articles.find((a) => a.id === selectedId) : null

  const {
    search,
    setSearch,
    popoverOpen,
    setPopoverOpen,
    searchLower,
    rootGroups,
    visibleUngrouped,
    hasNoResults,
    toggleGroup,
    closePopover,
    isGroupVisible,
    isArticleVisible,
    isExpanded,
    groupHasVisibleContent,
    getGroupArticles,
    getChildGroups,
  } = useArticleTreePicker({
    mode,
    groups,
    articles,
    articleGroups,
    excludeGroupIds,
  })

  const handleSelectArticle = (articleId: string) => {
    if (mode === 'single-article') {
      ;(props as SingleArticleProps).onSelect(articleId)
    }
    closePopover()
  }

  const handleSelectGroup = (groupId: string | null) => {
    if (mode === 'single-group') {
      ;(props as SingleGroupProps).onSelect(groupId)
      closePopover()
    } else if (mode === 'multiple-groups') {
      if (groupId) (props as MultipleGroupsProps).onToggleGroup(groupId)
    }
  }

  const handleClear = () => {
    if (mode === 'single-article') {
      ;(props as SingleArticleProps).onSelect(null)
    } else if (mode === 'single-group') {
      ;(props as SingleGroupProps).onSelect(null)
    }
    closePopover()
  }

  const isGroupSelected = (groupId: string) => {
    if (mode === 'single-group') return selectedId === groupId
    if (mode === 'multiple-groups')
      return (props as MultipleGroupsProps).selectedGroupIds.includes(groupId)
    return false
  }

  const renderGroup = (group: ArticleTreePickerGroup, depth: number) => (
    <TreeGroup
      key={group.id}
      group={group}
      depth={depth}
      mode={mode}
      selectedId={selectedId}
      isExpanded={isExpanded(group.id)}
      isGroupSelected={isGroupSelected(group.id)}
      isGroupVisible={isGroupVisible}
      groupHasVisibleContent={groupHasVisibleContent}
      isArticleVisible={isArticleVisible}
      getGroupArticles={getGroupArticles}
      childGroups={getChildGroups(group.id)}
      searchLower={searchLower}
      onToggle={toggleGroup}
      onSelectGroup={handleSelectGroup}
      onSelectArticle={handleSelectArticle}
      renderGroup={renderGroup}
    />
  )

  // --- Trigger label ---
  const triggerLabel = (() => {
    if (mode === 'multiple-groups') {
      const selected = groups.filter((g) =>
        (props as MultipleGroupsProps).selectedGroupIds.includes(g.id),
      )
      if (selected.length === 0)
        return <span className="text-muted-foreground">{emptyLabel || 'Не выбрано'}</span>
      return <span className="truncate">{selected.map((g) => g.name).join(', ')}</span>
    }
    if (mode === 'single-group') {
      const selected = selectedId ? groups.find((g) => g.id === selectedId) : null
      if (!selected)
        return (
          <span className="text-muted-foreground">{emptyLabel || 'Без родителя (корневая)'}</span>
        )
      return (
        <span className="flex items-center gap-1.5 truncate">
          <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{selected.name}</span>
        </span>
      )
    }
    // single-article
    if (selectedArticle) {
      return (
        <span className="flex items-center gap-1.5 truncate">
          <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{selectedArticle.title}</span>
        </span>
      )
    }
    return <span className="text-muted-foreground">{emptyLabel || 'Не выбрана'}</span>
  })()

  const defaultSearchPlaceholder = showArticles ? 'Поиск статьи...' : 'Поиск группы...'

  return (
    <div className="flex items-center gap-2">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={popoverOpen}
            className="flex-1 justify-between font-normal h-9"
          >
            {triggerLabel}
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[28rem] p-0 pointer-events-auto shadow-[0_4px_24px_rgba(0,0,0,0.15)]"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            setTimeout(() => searchInputRef.current?.focus(), 0)
          }}
        >
          {/* Search */}
          <div className="flex items-center border-b px-3 py-2 pointer-events-auto">
            <Search className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
            <input
              ref={searchInputRef}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground pointer-events-auto"
              placeholder={searchPlaceholder || defaultSearchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-1"
                onClick={() => setSearch('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tree */}
          <div className="max-h-[300px] overflow-y-auto overscroll-contain p-1 pointer-events-auto">
            {!isMultiple && (
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1.5 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent',
                  !selectedId && 'bg-accent font-medium',
                )}
                onClick={handleClear}
              >
                <span className="text-muted-foreground">
                  {mode === 'single-group' ? 'Без родителя (корневая)' : 'Не выбрана'}
                </span>
              </button>
            )}

            {rootGroups.map((group) => renderGroup(group, 0))}

            {/* Ungrouped articles (single-article mode only) */}
            {showArticles && visibleUngrouped.length > 0 && (
              <>
                {rootGroups.length > 0 && <div className="border-t my-1" />}
                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                  Без группы
                </div>
                {visibleUngrouped.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent',
                      article.id === selectedId && 'bg-accent font-medium',
                    )}
                    style={{ paddingLeft: '24px' }}
                    onClick={() => handleSelectArticle(article.id)}
                  >
                    <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{article.title}</span>
                  </button>
                ))}
              </>
            )}

            {hasNoResults && (
              <div className="px-2 py-4 text-sm text-center text-muted-foreground">
                Ничего не найдено
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear button (single modes only) */}
      {!isMultiple && selectedId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 flex-shrink-0"
          onClick={() => handleClear()}
          title="Очистить"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
