/**
 * Список чатов проекта для боковой панели мессенджера.
 * Показывает дефолтные чаты (Клиенты/Команда) и пользовательские.
 * Кнопка создания нового чата.
 */

import { memo } from 'react'
import { MessageSquare, Users, Hash, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

interface ChatListProps {
  chats: ProjectThread[]
  activeChatId: string | undefined
  onSelectChat: (chat: ProjectThread) => void
  onCreateChat?: () => void
  onRenameChat?: (chat: ProjectThread) => void
  onDeleteChat?: (chat: ProjectThread) => void
  /** Unprocesed counts per threadId */
  unreadCounts?: Record<string, number>
  compact?: boolean
}

function getChatIcon(chat: ProjectThread) {
  if (chat.legacy_channel === 'client') return MessageSquare
  if (chat.legacy_channel === 'internal') return Users
  return Hash
}

function getChatAccent(chat: ProjectThread, isActive: boolean) {
  if (!isActive) return 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
  if (chat.legacy_channel === 'client') return 'bg-blue-50 text-blue-600 font-medium'
  if (chat.legacy_channel === 'internal')
    return 'bg-white text-stone-900 font-medium shadow-[0_1px_3px_rgba(0,0,0,0.3)]'
  return 'bg-primary/10 text-primary font-medium'
}

export const ChatList = memo(function ChatList({
  chats,
  activeChatId,
  onSelectChat,
  onCreateChat,
  onRenameChat,
  onDeleteChat,
  unreadCounts = {},
  compact = false,
}: ChatListProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {chats.map((chat) => {
        const Icon = getChatIcon(chat)
        const isActive = activeChatId === chat.id
        const unread = unreadCounts[chat.id] ?? 0

        return (
          <div key={chat.id} className="flex items-center group">
            <button
              type="button"
              onClick={() => onSelectChat(chat)}
              className={cn(
                'flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                getChatAccent(chat, isActive),
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{chat.name}</span>
              {unread > 0 && (
                <span
                  className={cn(
                    'ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-white text-[11px] font-medium flex items-center justify-center',
                    chat.legacy_channel === 'internal' ? 'bg-stone-600' : 'bg-blue-600',
                  )}
                >
                  {unread}
                </span>
              )}
            </button>
            {/* Контекстное меню для пользовательских чатов */}
            {!chat.is_default && !compact && (onRenameChat || onDeleteChat) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {onRenameChat && (
                    <DropdownMenuItem onClick={() => onRenameChat(chat)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Переименовать
                    </DropdownMenuItem>
                  )}
                  {onDeleteChat && (
                    <DropdownMenuItem
                      onClick={() => onDeleteChat(chat)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
      {onCreateChat && !compact && (
        <button
          type="button"
          onClick={onCreateChat}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Новый чат
        </button>
      )}
    </div>
  )
})
