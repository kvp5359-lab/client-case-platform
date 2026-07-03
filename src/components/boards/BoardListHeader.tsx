"use client"

import { ChevronDown, ChevronRight, Copy, Filter, MoreVertical, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, CalendarClock } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeleteList, useDuplicateList, useSwapListOrder } from './hooks/useListMutations'
import type { BoardList } from './types'
import { hexToHeaderStyle } from './types'

type BoardListHeaderProps = {
  list: BoardList
  count: number
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSettings: () => void
  /** Открыть диалог создания треда с preset из фильтра колонки. Null для inbox/project. */
  onCreateThread?: () => void
  /** Разовая сортировка задач списка по сроку (с дедлайном — вперёд по возрастанию,
   *  остальные сохраняют порядок). Задаётся только для thread-списков. */
  onSortByDeadline?: () => void
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
  onCreateThread,
  onSortByDeadline,
  hasFilters,
  isInbox,
  isFirst,
  isLast,
  siblingLists,
}: BoardListHeaderProps) {
  const swapOrder = useSwapListOrder()
  const deleteList = useDeleteList()
  const duplicateList = useDuplicateList()
  const CollapseIcon = collapsed ? ChevronRight : ChevronDown
  const hs = hexToHeaderStyle(list.header_color)
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: `list-drag:${list.id}`,
  })

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
      {onCreateThread && (
        <button
          type="button"
          onClick={onCreateThread}
          aria-label="Создать в этом списке"
          title="Создать в этом списке"
          className="shrink-0 h-6 w-6 md:hidden md:group-hover/header:inline-flex items-center justify-center rounded-full hover:brightness-95"
          style={{ backgroundColor: hs.bg, color: hs.text }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        className="flex-1 h-0.5 rounded-full ml-1"
        style={{ backgroundColor: hs.bg }}
      />
      <div className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:group-hover/header:opacity-100 transition-opacity absolute right-0 bg-[#f6f6f7] rounded">
        <button
          ref={setDragRef}
          type="button"
          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          aria-label="Перетащить список"
          title="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
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
            {onSortByDeadline && (
              <DropdownMenuItem onClick={onSortByDeadline}>
                <CalendarClock className="h-3.5 w-3.5 mr-2" />
                Сортировать по сроку
              </DropdownMenuItem>
            )}
            {!isInbox && (
              <DropdownMenuItem
                onClick={() =>
                  duplicateList.mutate({ id: list.id, board_id: list.board_id })
                }
                disabled={duplicateList.isPending}
              >
                <Copy className="h-3.5 w-3.5 mr-2" />
                Дублировать
              </DropdownMenuItem>
            )}
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
