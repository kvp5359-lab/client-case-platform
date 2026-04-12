/**
 * Логика фильтрации/поиска для InboxPage: фильтр «Все / Непрочитанные»,
 * текстовый поиск, снимок непрочитанных, счётчик.
 */

import { useState, useCallback, useMemo } from 'react'
import type { InboxThreadEntry } from '@/services/api/inboxService'

export type InboxFilter = 'all' | 'unread'

function isUnread(c: InboxThreadEntry): boolean {
  return (
    c.unread_count > 0 ||
    c.has_unread_reaction ||
    c.manually_unread ||
    (c.unread_event_count ?? 0) > 0
  )
}

export function useInboxFilters(chats: InboxThreadEntry[]) {
  const [filter, setFilter] = useState<InboxFilter>('unread')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [unreadSnapshot, setUnreadSnapshot] = useState<Set<string> | null>(null)

  // Сброс снимка при смене фильтра; при включении unread — делаем снимок
  const handleSetFilter = useCallback(
    (f: InboxFilter) => {
      if (f === 'unread') {
        const ids = new Set(chats.filter(isUnread).map((c) => c.thread_id))
        setUnreadSnapshot(ids)
      } else {
        setUnreadSnapshot(null)
      }
      setFilter(f)
    },
    [chats],
  )

  // Фильтрация и поиск
  const filteredChats = useMemo(() => {
    let result = chats

    if (filter === 'unread') {
      result = result.filter(
        (c) => isUnread(c) || (unreadSnapshot?.has(c.thread_id) ?? false),
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (c) =>
          c.thread_name.toLowerCase().includes(q) ||
          (c.project_name?.toLowerCase().includes(q) ?? false),
      )
    }

    return result
  }, [chats, filter, searchQuery, unreadSnapshot])

  const unreadCount = useMemo(() => chats.filter(isUnread).length, [chats])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
  }, [])

  return {
    filter,
    handleSetFilter,
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    closeSearch,
    filteredChats,
    unreadCount,
  }
}
