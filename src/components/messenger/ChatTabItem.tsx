/**
 * ChatTabItem — одна вкладка чата в строке табов MessengerPanelContent.
 * Содержит: кнопка-таб, badge непрочитанных, dropdown-меню (pin/edit/delete).
 */

import { createElement } from 'react'
import { Pin, PinOff, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { getChatIconComponent, getChatTabAccent } from '@/components/messenger/ChatSettingsDialog'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

interface ChatTabItemProps {
  chat: ProjectThread
  isActive: boolean
  threadId: string | undefined
  unread: number
  hasReaction: boolean
  reactionEmoji: string | null
  isManuallyUnread: boolean
  accessTooltip: string | undefined
  onSelect: (chat: ProjectThread) => void
  onEdit: (chat: ProjectThread) => void
  onDelete: (chat: ProjectThread) => void
  onPin: (chatId: string, projectId: string, isPinned: boolean) => void
  projectId: string
}

export function ChatTabItem({
  chat,
  isActive,
  unread,
  hasReaction,
  reactionEmoji,
  isManuallyUnread,
  accessTooltip,
  onSelect,
  onEdit,
  onDelete,
  onPin,
  projectId,
}: ChatTabItemProps) {
  const isClient = chat.legacy_channel === 'client'
  const chatIconComponent = getChatIconComponent(chat.icon)
  const tabAccent = getChatTabAccent(chat.accent_color)

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center shrink-0 group">
            <div
              className={cn(
                'text-sm py-1 rounded-full transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer',
                isActive ? 'pl-2.5 pr-1' : 'px-2.5',
                isActive
                  ? `${tabAccent.active} font-medium ring-1 ring-black/10`
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              role="tab"
              tabIndex={0}
              onClick={() => onSelect(chat)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(chat)
                }
              }}
            >
              {chat.is_pinned && <Pin className="h-2.5 w-2.5 shrink-0 opacity-50" />}
              {createElement(chatIconComponent, { className: 'h-3.5 w-3.5 shrink-0' })}
              <span className={chat.type === 'task' ? 'truncate max-w-[160px]' : undefined}>
                {chat.name}
              </span>

              {/* Бейдж непрочитанных */}
              {unread > 0 && (
                <span
                  className={cn(
                    'ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[11px] font-medium flex items-center justify-center',
                    tabAccent.badge,
                  )}
                >
                  {unread}
                </span>
              )}

              {/* Emoji-реакция (только для client, когда нет числового unread) */}
              {isClient && unread === 0 && hasReaction && reactionEmoji && (
                <span
                  className={cn(
                    'ml-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full',
                    tabAccent.badge,
                  )}
                >
                  <span className="text-[11px] leading-none">{reactionEmoji}</span>
                </span>
              )}

              {/* Точка «вручную непрочитано» */}
              {unread === 0 && isManuallyUnread && !(isClient && hasReaction) && (
                <span
                  className={cn(
                    'ml-0.5 min-w-[18px] h-[18px] rounded-full shrink-0',
                    tabAccent.badge,
                  )}
                />
              )}

              {/* Dropdown-меню — показывается только на активной вкладке */}
              {isActive && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-black/10 transition-colors"
                      aria-label="Меню чата"
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
                        onPin(chat.id, projectId, !chat.is_pinned)
                      }}
                    >
                      {chat.is_pinned ? (
                        <>
                          <PinOff className="h-3.5 w-3.5 mr-2" />
                          Открепить
                        </>
                      ) : (
                        <>
                          <Pin className="h-3.5 w-3.5 mr-2" />
                          Закрепить
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(chat)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Настройки
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(chat)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Удалить чат
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="whitespace-pre-line max-w-[250px]">
          {accessTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
