"use client"

import { ChevronDown, ChevronRight, Filter, MoreVertical, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeleteList, useSwapListOrder } from './hooks/useListMutations'
import type { BoardList } from './types'
import { hexToHeaderStyle } from './types'

interface BoardListHeaderProps {
  list: BoardList
  count: number
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSettings: () => void
  hasFilters: boolean
  isInbox: boolean
  isFirst?: boolean
  isLast?: boolean
  siblingLists?: BoardList[]
}

export function BoardListHeader({
  list,
  count,
  collapsed,
  onToggleCollapse,
  onOpenSettings,
  hasFilters,
  isInbox,
  isFirst,
  isLast,
  siblingLists,
}: BoardListHeaderProps) {
  const swapOrder = useSwapListOrder()
  const deleteList = useDeleteList()
  const CollapseIcon = collapsed ? ChevronRight : ChevronDown
  const hs = hexToHeaderStyle(list.header_color)

  const handleSwap = (direction: 'up' | 'down') => {
    if (!siblingLists) return
    const idx = siblingLists.findIndex((l) => l.id === list.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= siblingLists.length) return
    const target = siblingLists[targetIdx]
    swapOrder.mutate({ listAId: list.id, listBId: target.id, board_id: list.board_id })
  }

  return (
    <div className="group/header relative flex items-center gap-2 mb-0 min-w-0">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors min-w-0 max-w-full"
        style={{ backgroundColor: hs.bg, color: hs.text }}
      >
        <CollapseIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-sm font-medium truncate">{list.name}</span>
        {count > 0 && (
          <span className="text-sm opacity-60 shrink-0">{count}</span>
        )}
      </button>
      <div
        className="flex-1 h-0.5 rounded-full ml-1"
        style={{ backgroundColor: hs.bg }}
      />
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/header:opacity-100 transition-opacity absolute right-0 bg-[#f6f6f7] rounded">
        {!isInbox && hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary"
            onClick={onOpenSettings}
          >
            <Filter className="h-3 w-3" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpenSettings}>
              <Filter className="h-3.5 w-3.5 mr-2" />
              Настройки
            </DropdownMenuItem>
            {siblingLists && siblingLists.length > 1 && !isFirst && (
              <DropdownMenuItem onClick={() => handleSwap('up')}>
                <ArrowUp className="h-3.5 w-3.5 mr-2" />
                Выше
              </DropdownMenuItem>
            )}
            {siblingLists && siblingLists.length > 1 && !isLast && (
              <DropdownMenuItem onClick={() => handleSwap('down')}>
                <ArrowDown className="h-3.5 w-3.5 mr-2" />
                Ниже
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive"
              onClick={() =>
                deleteList.mutate({ id: list.id, board_id: list.board_id })
              }
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Удалить список
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
