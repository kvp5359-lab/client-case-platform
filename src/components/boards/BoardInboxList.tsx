"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import { useFilteredInbox, useFilteredInboxUnread } from '@/hooks/messenger/useFilteredInbox'
import { useInboxMarkMutations } from '@/hooks/messenger/useInboxMarkMutations'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

type InboxFilter = 'all' | 'unread'

/** Convert InboxThreadEntry → TaskItem for opening in TaskPanel */
function threadToTaskItem(thread: InboxThreadEntry): TaskItem {
  return {
    id: thread.thread_id,
    name: thread.thread_name,
    type: thread.thread_type,
    project_id: thread.project_id,
    workspace_id: '',
    status_id: null,
    deadline: null,
    accent_color: thread.thread_accent_color ?? 'blue',
    icon: thread.thread_icon ?? 'message-square',
    is_pinned: false,
    created_at: thread.last_message_at ?? '',
    project_name: thread.project_name,
    sort_order: 0,
  }
}

type BoardInboxListProps = {
  threads: InboxThreadEntry[]
  onOpenThread: (task: TaskItem) => void
  selectedThreadId?: string | null
  defaultFilter?: InboxFilter
  workspaceId: string
}

export function BoardInboxList({
  threads,
  onOpenThread,
  selectedThreadId,
  defaultFilter = 'all',
  workspaceId,
}: BoardInboxListProps) {
  const [filter, setFilter] = useState<InboxFilter>(defaultFilter)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Подписываемся на тот же infinite query, что родитель — получаем
  // hasNextPage/fetchNextPage без drilling props. TanStack Query
  // дедуплицирует — лишнего запроса не будет.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = useFilteredInbox(workspaceId)
  // Все непрочитанные одним запросом — источник вкладки «Непрочитанные».
  const { data: unreadThreads = [] } = useFilteredInboxUnread(workspaceId)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const q = searchQuery.trim().toLowerCase()
  // Вкладка «Непрочитанные» без активного поиска работает на полном списке
  // непрочитанных (unreadThreads), а не на пагинированных threads — поэтому
  // здесь не нужна догрузка страниц (раньше короткий список запускал каскад).
  const usingUnreadSource = filter === 'unread' && !q
  // Догрузку оставляем только когда источник — пагинированный threads.
  const showLoadMore = !usingUnreadSource && hasNextPage

  useEffect(() => {
    if (!showLoadMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [showLoadMore, isFetchingNextPage, fetchNextPage])

  // Общие mark-read/unread мутации — одна реализация на InboxPage и BoardInboxList.
  const { markRead: markReadMutation, markUnread: markUnreadMutation } =
    useInboxMarkMutations(workspaceId)

  // Точный счётчик непрочитанных — из полного списка, не из загруженных страниц.
  const unreadCount = unreadThreads.length

  const filteredThreads = useMemo(() => {
    // При активном поиске unread-фильтр игнорируется — ищем по всему загруженному
    // списку, включая прочитанные. Так пользователь не упустит нужного собеседника
    // только потому, что сейчас выбрана вкладка «Непрочитанные».
    if (q) {
      return threads.filter(
        (c) =>
          c.thread_name.toLowerCase().includes(q) ||
          (c.project_name?.toLowerCase().includes(q) ?? false),
      )
    }
    // Вкладка «Непрочитанные» — полный список непрочитанных одним запросом.
    if (filter === 'unread') return unreadThreads
    return threads
  }, [threads, unreadThreads, filter, q])

  return (
    <div>
      {/* Filter bar */}
      <div className="px-2 py-1.5 border-b border-border/50 flex items-center gap-1">
        {searchOpen ? (
          <div className="flex items-center gap-1.5 flex-1">
            <Search className="h-3 w-3 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-xs py-0.5 bg-transparent focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1',
                filter === 'unread'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              Непрочитанные
              {unreadCount > 0 && (
                <span className={cn(
                  'min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-medium flex items-center justify-center',
                  filter === 'unread' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600',
                )}>
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full transition-colors',
                filter === 'all'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="ml-auto p-0.5 rounded hover:bg-gray-100 text-gray-400"
            >
              <Search className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Thread list */}
      <div className="divide-y divide-border/50 border-b border-border/50">
        {filteredThreads.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            {filter === 'unread' ? 'Нет непрочитанных' : searchQuery ? 'Ничего не найдено' : 'Пусто'}
          </div>
        ) : (
          <>
            {filteredThreads.map((chat) => (
              <InboxChatItem
                key={chat.thread_id}
                chat={chat}
                isSelected={selectedThreadId === chat.thread_id}
                onClick={() => onOpenThread(threadToTaskItem(chat))}
                onMarkAsRead={() => markReadMutation.mutate(chat)}
                onMarkAsUnread={() => markUnreadMutation.mutate(chat)}
              />
            ))}
            {showLoadMore && (
              <div ref={sentinelRef} className="px-3 py-2 text-[10px] text-muted-foreground text-center">
                {isFetchingNextPage ? 'Загружаем ещё…' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
