/**
 * Левая панель страницы «Входящие» — заголовок, поиск, фильтры, список чатов.
 */

import { memo } from 'react'
import { Inbox, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { InboxFilter } from './useInboxFilters'

interface InboxSidebarProps {
  filter: InboxFilter
  onSetFilter: (f: InboxFilter) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  searchOpen: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  unreadCount: number
  isLoading: boolean
  filteredChats: InboxThreadEntry[]
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onMarkAsRead: (chat: InboxThreadEntry) => void
  onMarkAsUnread: (chat: InboxThreadEntry) => void
}

export const InboxSidebar = memo(function InboxSidebar({
  filter,
  onSetFilter,
  searchQuery,
  onSearchQueryChange,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  unreadCount,
  isLoading,
  filteredChats,
  activeThreadId,
  onSelectThread,
  onMarkAsRead,
  onMarkAsUnread,
}: InboxSidebarProps) {
  return (
    <div className="w-[35%] min-w-[220px] max-w-[352px] flex flex-col border-r overflow-hidden">
      {/* Заголовок + поиск */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Входящие</h2>
        </div>

        <div className="flex items-center gap-1">
          {searchOpen ? (
            /* Поле поиска заменяет фильтры */
            <div className="flex items-center gap-1.5 flex-1">
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Поиск по чату или проекту..."
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                className="flex-1 text-sm py-1 bg-transparent focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={onCloseSearch}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            /* Фильтры + кнопка поиска */
            <>
              <button
                type="button"
                onClick={() => onSetFilter('all')}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  filter === 'all'
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => onSetFilter('unread')}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
                  filter === 'unread'
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                Непрочитанные
                {unreadCount > 0 && (
                  <span
                    className={cn(
                      'min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center',
                      filter === 'unread'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600',
                    )}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={onOpenSearch}
                className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Список чатов */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Загрузка...
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {filter === 'unread'
              ? 'Нет непрочитанных'
              : searchQuery
                ? 'Ничего не найдено'
                : 'Нет активных чатов'}
          </div>
        ) : (
          filteredChats.map((chat) => (
            <InboxChatItem
              key={chat.thread_id}
              chat={chat}
              isSelected={activeThreadId === chat.thread_id}
              onClick={() => onSelectThread(chat.thread_id)}
              onMarkAsRead={() => onMarkAsRead(chat)}
              onMarkAsUnread={() => onMarkAsUnread(chat)}
            />
          ))
        )}
      </div>
    </div>
  )
})
