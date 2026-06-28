"use client"

/**
 * Одна вкладка в TaskPanelTabBar — sortable, с контекстным меню
 * (Закрепить/Открепить, Закрыть) и бейджем (точка/число/эмодзи).
 */

import { X, Pin, PinOff } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { BadgeDisplay } from '@/utils/inboxUnread'
import type { TaskPanelTab } from '@/types/taskPanelTabs'

export type DraggableTabProps = {
  tab: TaskPanelTab
  isActive: boolean
  accent: { active: string; badge: string } | null
  Icon: React.ComponentType<{ className?: string }>
  badge: BadgeDisplay | undefined
  hasBadge: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onTogglePin?: (id: string) => void
}

export function DraggableTab({
  tab,
  isActive,
  accent,
  Icon,
  badge,
  hasBadge,
  onActivate,
  onClose,
  onTogglePin,
}: DraggableTabProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: tab.id,
  })

  // Y залочен: вкладка скользит только по горизонтали. Соседние вкладки сами
  // расступаются под курсором благодаря horizontalListSortingStrategy —
  // отдельный drop-индикатор не нужен.
  const dragStyle: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString({ ...transform, y: 0 }) : undefined,
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          data-tab-id={tab.id}
          {...attributes}
          {...listeners}
          style={dragStyle}
          className={cn(
            'group relative flex items-center gap-1 rounded-full text-xs cursor-pointer min-w-0',
            // Закреплённые компактные: только иконка (+ бейдж/крестик), без текста.
            tab.pinned ? 'px-1.5 h-6 w-7 justify-center shrink-0' : 'pl-2 pr-2 h-6 min-w-[80px]',
            !tab.pinned && (isActive ? 'shrink-0' : 'shrink'),
            isActive
              ? cn(
                  'border border-gray-300 shadow-md ring-1 ring-black/5',
                  accent ? accent.active : 'bg-white text-foreground',
                )
              : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
            isDragging && 'shadow-2xl ring-2 ring-blue-500/60 cursor-grabbing scale-105 z-50',
          )}
          onClick={() => onActivate(tab.id)}
          title={tab.title}
        >
          <Icon className="shrink-0 w-3.5 h-3.5" />
          {!tab.pinned && (
            <span className="truncate min-w-0 flex-1 max-w-[110px]">{tab.title}</span>
          )}

          {/* Бейдж и крестик. У pinned — мини-бейдж в углу (без места под крестик). */}
          {tab.pinned ? (
            <>
              {hasBadge && badge && badge.type === 'dot' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                />
              )}
              {hasBadge && badge && badge.type === 'number' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[9px] leading-none font-semibold text-white ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                >
                  {badge.value > 99 ? '99+' : badge.value}
                </span>
              )}
              {hasBadge && badge && badge.type === 'emoji' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-[10px] leading-none ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                >
                  {badge.value}
                </span>
              )}
            </>
          ) : (
            <>
              {/* Бейдж: занимает место в потоке только когда есть. На hover
                  скрывается, чтобы крестик визуально перекрыл его в той же позиции. */}
              {hasBadge && badge && (
                <div
                  className={cn(
                    'relative w-4 h-4 shrink-0 -ml-1',
                    'group-hover:opacity-0 transition-opacity',
                  )}
                >
                  {badge.type === 'dot' && (
                    <span
                      className={cn(
                        'absolute inset-0 rounded-full',
                        accent ? accent.badge : 'bg-blue-600',
                      )}
                    />
                  )}
                  {badge.type === 'number' && (
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-full text-[10px] leading-none font-semibold text-white px-1',
                        accent ? accent.badge : 'bg-blue-600',
                      )}
                    >
                      {badge.value > 99 ? '99+' : badge.value}
                    </span>
                  )}
                  {badge.type === 'emoji' && (
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-full text-[10px] leading-none',
                        accent ? accent.badge : 'bg-blue-600',
                      )}
                    >
                      {badge.value}
                    </span>
                  )}
                </div>
              )}
              {/* Крестик: появляется поверх правого края при hover, в потоке не
                  занимает места — текст вкладки получает чуть больше пространства. */}
              <button
                type="button"
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  isActive ? 'bg-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200',
                  'text-muted-foreground hover:text-foreground',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Закрыть вкладку"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onTogglePin && (
          <ContextMenuItem onClick={() => onTogglePin(tab.id)}>
            {tab.pinned ? (
              <>
                <PinOff className="w-3.5 h-3.5 mr-2" /> Открепить
              </>
            ) : (
              <>
                <Pin className="w-3.5 h-3.5 mr-2" /> Закрепить
              </>
            )}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onClose(tab.id)} className="text-destructive">
          <X className="w-3.5 h-3.5 mr-2" /> Закрыть
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
