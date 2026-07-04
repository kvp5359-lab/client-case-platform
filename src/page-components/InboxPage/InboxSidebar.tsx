/**
 * Левая панель страницы «Входящие» — заголовок, поиск, фильтры, список чатов.
 */

import { memo, useEffect, useRef } from 'react'
import { Inbox, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RowsSkeleton } from '@/components/ui/loaders'
import { InboxChatItem } from '@/components/messenger/InboxChatItem'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { DeliveryStatus } from '@/components/messenger/DeliveryIndicator'
import type { InboxFilter } from './useInboxFilters'

type InboxSidebarProps = {
  filter: InboxFilter
  onSetFilter: (f: InboxFilter) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  searchOpen: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  unreadCount: number
  /** «Ждём клиента» — внешние диалоги, где последними писали мы (прочитано). */
  awaitingCount: number
  /** «Нужно ответить» — внешние диалоги, где последним писал клиент (прочитано). */
  needsReplyCount: number
  /** «Заглушённые» — число замьюченных тредов с непрочитанным (архив). */
  mutedCount: number
  isLoading: boolean
  filteredChats: InboxThreadEntry[]
  activeThreadId: string | null
  onSelectThread: (threadId: string) => void
  onMarkAsRead: (chat: InboxThreadEntry) => void
  onMarkAsUnread: (chat: InboxThreadEntry) => void
  /** Карта thread_id → статус доставки последнего исходящего (галочка в превью). */
  deliveryStatuses?: Map<string, DeliveryStatus>
  /** Есть ли следующая страница в пагинированном инбоксе. */
  hasNextPage?: boolean
  /** Идёт ли догрузка следующей страницы. */
  isFetchingNextPage?: boolean
  /** Триггер догрузки — подписывается на intersection sentinel в конце списка. */
  onLoadMore?: () => void
  /** Имя текущего пользователя — для замены своего имени отправителя на «Я». */
  selfSenderName?: string | null
  /** Доп. классы корня (управление шириной на мобиле). */
  className?: string
  /** Узкая полоска (мобила, открыт чат): шапка списка скрыта, видны аватары. */
  narrow?: boolean
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
  awaitingCount,
  needsReplyCount,
  mutedCount,
  isLoading,
  filteredChats,
  activeThreadId,
  onSelectThread,
  onMarkAsRead,
  onMarkAsUnread,
  deliveryStatuses,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  selfSenderName,
  className,
  narrow = false,
}: InboxSidebarProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // IntersectionObserver на «сторожевом» div'е в конце списка — когда юзер
  // прокрутил список так, что sentinel виден, дёргаем onLoadMore.
  useEffect(() => {
    if (!hasNextPage || !onLoadMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          onLoadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, onLoadMore])

  return (
    <div
      className={cn(
        // Мобила — на весь экран (master-detail), десктоп — узкая колонка списка.
        'w-full md:w-[35%] md:min-w-[220px] md:max-w-[352px] flex flex-col border-r overflow-hidden',
        className,
      )}
    >
      {/* Заголовок + поиск. В узкой полоске (мобила, открыт чат) скрыт —
          обрезался бы; на десктопе виден всегда. */}
      <div className={cn('px-4 py-3 border-b shrink-0', narrow && 'hidden md:block')}>
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
              {/* Вкладки в одну строку с горизонтальным скроллом (без переноса, без видимой полосы). */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSetFilter('unread')}
                  className={cn(
                    'shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
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
                  onClick={() => onSetFilter('all')}
                  className={cn(
                    'shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-full transition-colors',
                    filter === 'all'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100',
                  )}
                >
                  Все
                </button>
                <button
                  type="button"
                  onClick={() => onSetFilter('muted')}
                  title="Заглушённые треды — уведомлений нет, но непрочитанное сохраняется. Прямое упоминание/ответ тебе всё равно всплывёт в «Непрочитанных»"
                  className={cn(
                    'shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
                    filter === 'muted'
                      ? 'bg-gray-200 text-gray-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100',
                  )}
                >
                  Заглушённые
                  {mutedCount > 0 && (
                    <span
                      className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center bg-gray-300 text-gray-700"
                    >
                      {mutedCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSetFilter('needs_reply')}
                  title="Внешние диалоги, где последним написал клиент и всё прочитано — нужен твой ответ"
                  className={cn(
                    'shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
                    filter === 'needs_reply'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100',
                  )}
                >
                  Нужно ответить
                  {needsReplyCount > 0 && (
                    <span
                      className={cn(
                        'min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center',
                        filter === 'needs_reply'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600',
                      )}
                    >
                      {needsReplyCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSetFilter('awaiting')}
                  title="Внешние диалоги, где последними написали мы — ждём ответа клиента"
                  className={cn(
                    'shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1',
                    filter === 'awaiting'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-100',
                  )}
                >
                  Ждём клиента
                  {awaitingCount > 0 && (
                    <span
                      className={cn(
                        'min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium flex items-center justify-center',
                        filter === 'awaiting'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600',
                      )}
                    >
                      {awaitingCount}
                    </span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={onOpenSearch}
                className="shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
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
          <RowsSkeleton count={7} className="p-3" rowClassName="h-14" />
        ) : filteredChats.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                      : 'Нет активных чатов'}
          </div>
        ) : (
          <>
            {filteredChats.map((chat) => (
              <InboxChatItem
                key={chat.thread_id}
                chat={chat}
                isSelected={activeThreadId === chat.thread_id}
                onClick={() => onSelectThread(chat.thread_id)}
                onMarkAsRead={() => onMarkAsRead(chat)}
                onMarkAsUnread={() => onMarkAsUnread(chat)}
                deliveryStatus={deliveryStatuses?.get(chat.thread_id)}
                selfSenderName={selfSenderName}
                mutedBadge={filter === 'muted'}
              />
            ))}
            {hasNextPage && (
              <div ref={sentinelRef} className="px-4 py-3 text-center text-xs text-muted-foreground">
                {isFetchingNextPage ? 'Загружаем ещё…' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
})
