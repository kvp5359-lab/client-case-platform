/**
 * GroupTreeFilterContent — иерархический выбор групп для фильтра.
 *
 * Рендерит дерево групп с чекбоксами и поиском.
 * Используется внутри FilterChip как кастомный popoverContent.
 * Визуально повторяет дерево из ArticleTreePicker (mode="multiple-groups").
 */

import { useState, useMemo, useRef } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown, ChevronRight, FolderOpen, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GroupItem {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
}

interface GroupTreeFilterContentProps {
  groups: GroupItem[]
  selectedIds: string[]
  onToggle: (groupId: string) => void
}

export function GroupTreeFilterContent({
  groups,
  selectedIds,
  onToggle,
}: GroupTreeFilterContentProps) {
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchLower = search.toLowerCase().trim()

  const rootGroups = useMemo(
    () =>
      groups
        .filter((g) => !g.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [groups],
  )

  const getChildGroups = (parentId: string) =>
    groups
      .filter((g) => g.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  // Collect all group IDs that match search (including parents for visibility)
  const matchingGroupIds = useMemo(() => {
    if (!searchLower) return null
    const ids = new Set<string>()

    const addParents = (groupId: string) => {
      ids.add(groupId)
      const group = groups.find((g) => g.id === groupId)
      if (group?.parent_id) addParents(group.parent_id)
    }

    for (const g of groups) {
      if (g.name.toLowerCase().includes(searchLower)) {
        ids.add(g.id)
        if (g.parent_id) addParents(g.parent_id)
      }
    }

    return ids
  }, [searchLower, groups])

  const toggleCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const isGroupVisible = (groupId: string) => {
    if (!matchingGroupIds) return true
    return matchingGroupIds.has(groupId)
  }

  const isGroupNameMatch = (group: GroupItem) => {
    if (!searchLower) return true
    return group.name.toLowerCase().includes(searchLower)
  }

  const isExpanded = (groupId: string) => {
    if (searchLower && matchingGroupIds?.has(groupId)) return true
    return !collapsedGroups.has(groupId)
  }

  const groupHasVisibleContent = (groupId: string): boolean => {
    const group = groups.find((g) => g.id === groupId)
    if (group && isGroupNameMatch(group)) return true
    const children = getChildGroups(groupId)
    return children.some((child) => isGroupVisible(child.id) && groupHasVisibleContent(child.id))
  }

  const renderGroup = (group: GroupItem, depth: number): React.ReactNode => {
    if (!isGroupVisible(group.id)) return null
    if (searchLower && !groupHasVisibleContent(group.id)) return null

    const childGroups = getChildGroups(group.id)
    const expanded = isExpanded(group.id)
    const hasChildren = childGroups.some((c) => isGroupVisible(c.id))
    const isSelected = selectedIds.includes(group.id)

    return (
      <div key={group.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 w-full px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent',
            isSelected && 'bg-accent',
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => onToggle(group.id)}
        >
          {hasChildren ? (
            <button
              type="button"
              className="flex-shrink-0 p-0 bg-transparent border-none"
              onClick={(e) => {
                e.stopPropagation()
                toggleCollapse(group.id)
              }}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
              )}
            </button>
          ) : (
            <span className="w-3.5 flex-shrink-0" />
          )}

          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(group.id)}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          />

          <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate font-medium">{group.name}</span>
        </div>

        {expanded && childGroups.map((child) => renderGroup(child, depth + 1))}
      </div>
    )
  }

  const hasNoResults = searchLower && rootGroups.every((g) => !groupHasVisibleContent(g.id))

  return (
    <div>
      {/* Search */}
      <div className="flex items-center border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
        <input
          ref={searchInputRef}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Поиск группы..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
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
      <div className="max-h-[300px] overflow-y-auto overscroll-contain p-1">
        {rootGroups.map((group) => renderGroup(group, 0))}

        {hasNoResults && (
          <div className="px-2 py-4 text-sm text-center text-muted-foreground">
            Ничего не найдено
          </div>
        )}

        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-3 text-center">Нет групп</p>
        )}
      </div>
    </div>
  )
}
