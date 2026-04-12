"use client"

import { Kanban, MoreVertical, Trash2, Pencil, ListPlus, Pin, PinOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Board } from '@/components/boards/types'

interface BoardTabProps {
  board: Board
  isActive: boolean
  isPinned: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onAddList: () => void
  onTogglePin: () => void
}

export function BoardTab({ board, isActive, isPinned, onSelect, onEdit, onDelete, onAddList, onTogglePin }: BoardTabProps) {
  return (
    <div className="flex items-center shrink-0">
      <div
        className={cn(
          'text-sm py-1 rounded-full transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
          isActive ? 'pl-2.5 pr-1' : 'px-2.5',
          isActive
            ? 'bg-amber-50 text-amber-700 font-medium shadow-[0_1px_4px_rgba(0,0,0,0.15)]'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        )}
        role="tab"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
      >
        <Kanban className="h-3.5 w-3.5 shrink-0" />
        <span>{board.name}</span>

        {/* Dropdown-меню — только на активной вкладке */}
        {isActive && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-black/10 transition-colors"
                aria-label="Меню доски"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.stopPropagation()
                }}
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onAddList()
                }}
              >
                <ListPlus className="h-3.5 w-3.5 mr-2" />
                Добавить список
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin()
                }}
              >
                {isPinned ? (
                  <>
                    <PinOff className="h-3.5 w-3.5 mr-2" />
                    Открепить из сайдбара
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5 mr-2" />
                    Закрепить в сайдбаре
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Настройки
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Удалить доску
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
