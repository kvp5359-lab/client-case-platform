"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { perfOpen } from '@/utils/perfTrace'
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import {
  useFilteredInbox,
  useFilteredInboxUnread,
  useFilteredInboxAwaitingReply,
  useFilteredInboxNeedsReply,
  useFilteredInboxMuted,
  useFilteredInboxSearch,
  useInboxMessageStatuses,
  useInboxSegmentCounts,
} from '@/hooks/messenger/useFilteredInbox'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { useInboxMarkMutations } from '@/hooks/messenger/useInboxMarkMutations'
import { useMySenderName } from '@/hooks/messenger/useMySenderName'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { TaskItem } from '@/components/tasks/types'

type InboxFilter = 'all' | 'unread' | 'awaiting' | 'needs_reply' | 'muted'

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
  const selfSenderName = useMySenderName(workspaceId)

  // Подписываемся на тот же infinite query, что родитель — получаем
  // hasNextPage/fetchNextPage без drilling props. TanStack Query
  // дедуплицирует — лишнего запроса не будет.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = useFilteredInbox(workspaceId)
  // Все непрочитанные одним запросом — источник вкладки «Непрочитанные».
  const { data: unreadThreads = [] } = useFilteredInboxUnread(workspaceId)
  // «Ждём клиента» / «Нужно ответить» — тяжёлые списки, грузятся ЛЕНИВО (только
  // при активной вкладке). Бейджи-счётчики — из лёгких агрегатов ниже.
  const { data: awaitingThreads = [] } = useFilteredInboxAwaitingReply(
    workspaceId,
    filter === 'awaiting',
  )
  const { data: needsReplyThreads = [] } = useFilteredInboxNeedsReply(
    workspaceId,
    filter === 'needs_reply',
  )
  // «Заглушённые» — весь список одним запросом (как unread), бейдж = длина списка.
  const { data: mutedThreads = [] } = useFilteredInboxMuted(workspaceId)
  // Серверный поиск по тредам инбокса (по названию треда/проекта) — ищет по всем,
  // а не по загруженным страницам. Debounce, чтобы не дёргать RPC на каждую букву.
  const debouncedSearch = useDebounce(searchQuery.trim(), 300)
  const { data: searchResults = [] } = useFilteredInboxSearch(workspaceId, debouncedSearch)
  // Статусы доставки последних исходящих — для галочки в превью.
  const deliveryStatuses = useInboxMessageStatuses(workspaceId)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const q = searchQuery.trim().toLowerCase()
  // Догрузку страниц оставляем ТОЛЬКО на вкладке «Все» без поиска. На «Непрочитанных»
  // источник полный (unreadThreads), при поиске — серверный (searchResults); в обоих
  // случаях пагинация не нужна (иначе короткий список запускал бы каскад догрузки).
  const showLoadMore = !q && filter === 'all' && hasNextPage

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
  const mutedCount = mutedThreads.length
  // Счётчики «Ждём клиента» / «Нужно ответить» — из лёгких агрегатов, а не из
  // тяжёлых списков (они теперь грузятся лениво). Дешёвый бейдж без RPC-обёрток.
  const { needsReply: needsReplyCount, awaiting: awaitingCount } =
    useInboxSegmentCounts(workspaceId)

  const filteredThreads = useMemo(() => {
    // При активном поиске — серверные результаты по всем тредам инбокса
    // (по названию треда/проекта), а не фильтр загруженных страниц.
    if (q) return searchResults
    // Вкладка «Непрочитанные» — полный список непрочитанных одним запросом.
    if (filter === 'unread') return unreadThreads
    // «Нужно ответить» — внешние диалоги, где клиент написал последним.
    if (filter === 'needs_reply') return needsReplyThreads
    // «Ждём клиента» — внешние диалоги, где мы написали последними.
    if (filter === 'awaiting') return awaitingThreads
    // «Заглушённые» — замьюченные треды с непрочитанным (архивные счётчики).
    if (filter === 'muted') return mutedThreads
    return threads
  }, [threads, unreadThreads, awaitingThreads, needsReplyThreads, mutedThreads, searchResults, filter, q])

  return (
    <div>
      {/* Filter bar — прилипает к верху при прокрутке списка */}
      <div className="sticky top-0 z-10 bg-white px-2 py-1.5 border-b border-border/50 flex items-center gap-1">
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
            {/* Вкладки в одну строку с горизонтальным скроллом (без переноса, без видимой полосы). */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide scroll-fade-right min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={cn(
                  'shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1',
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
                  'shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full transition-colors',
                  filter === 'all'
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => setFilter('muted')}
                title="Заглушённые треды — уведомлений нет, непрочитанное сохраняется. Прямое упоминание/ответ тебе всплывёт в «Непрочитанных»"
                className={cn(
                  'shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1',
                  filter === 'muted'
                    ? 'bg-gray-200 text-gray-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                Заглушённые
                {mutedCount > 0 && (
                  <span className="min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-medium flex items-center justify-center bg-gray-300 text-gray-700">
                    {mutedCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilter('needs_reply')}
                title="Внешние диалоги, где последним написал клиент и всё прочитано — нужен твой ответ"
                className={cn(
                  'shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1',
                  filter === 'needs_reply'
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                Нужно ответить
                {needsReplyCount > 0 && (
                  <span className={cn(
                    'min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-medium flex items-center justify-center',
                    filter === 'needs_reply' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600',
                  )}>
                    {needsReplyCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilter('awaiting')}
                title="Внешние диалоги, где последними написали мы — ждём ответа клиента"
                className={cn(
                  'shrink-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1',
                  filter === 'awaiting'
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                Ждём клиента
                {awaitingCount > 0 && (
                  <span className={cn(
                    'min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-medium flex items-center justify-center',
                    filter === 'awaiting' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600',
                  )}>
                    {awaitingCount}
                  </span>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="shrink-0 p-0.5 rounded hover:bg-gray-100 text-gray-400"
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
            {filter === 'unread'
              ? 'Нет непрочитанных'
              : filter === 'needs_reply'
                ? 'Нет диалогов, ждущих ответа'
                : filter === 'awaiting'
                  ? 'Нет диалогов в ожидании клиента'
                  : filter === 'muted'
                    ? 'Нет заглушённых с непрочитанным'
                    : searchQuery
                      ? 'Ничего не найдено'
                      : 'Пусто'}
          </div>
        ) : (
          <>
            {filteredThreads.map((chat) => (
              <InboxChatItem
                key={chat.thread_id}
                chat={chat}
                isSelected={selectedThreadId === chat.thread_id}
                onClick={() => {
                  perfOpen(chat.thread_id, {
                    channel: chat.channel_type,
                    type: chat.thread_type,
                  })
                  onOpenThread(threadToTaskItem(chat))
                }}
                onMarkAsRead={() => markReadMutation.mutate(chat)}
                onMarkAsUnread={() => markUnreadMutation.mutate(chat)}
                workspaceId={workspaceId}
                deliveryStatus={deliveryStatuses.get(chat.thread_id)}
                selfSenderName={selfSenderName}
                mutedBadge={filter === 'muted'}
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
