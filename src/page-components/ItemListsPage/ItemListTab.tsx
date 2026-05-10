"use client"

/**
 * Вкладка одного item_list в шапке ItemListsPage. Полностью повторяет визуал
 * BoardTab — единый паттерн вкладок в проекте.
 */

import { ListChecks, FolderOpen, MoreVertical, Trash2, Pencil, Pin, PinOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ItemList } from '@/hooks/useItemLists'

interface ItemListTabProps {
  list: ItemList
  isActive: boolean
  isPinned: boolean
  /** Может ли текущий пользователь менять закрепления (на уровне воркспейса). */
  canPin: boolean
  /** Может ли текущий пользователь редактировать/удалять этот список. */
  canManage: boolean
  onSelect: () => void
  onEditSettings: () => void
  onDelete: () => void
  onTogglePin: () => void
}

export function ItemListTab({
  list,
  isActive,
  isPinned,
  canPin,
  canManage,
  onSelect,
  onEditSettings,
  onDelete,
  onTogglePin,
}: ItemListTabProps) {
  const Icon = list.entity_type === 'project' ? FolderOpen : ListChecks
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
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{list.name}</span>

        {isActive && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-black/10 transition-colors"
                aria-label="Меню списка"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.stopPropagation()
                }}
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4}>
              {canManage && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditSettings()
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Настройки
                </DropdownMenuItem>
              )}
              {canPin && (
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
              )}
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete()
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Удалить список
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
