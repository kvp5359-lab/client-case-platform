/**
 * Логика фильтрации/поиска для InboxPage: фильтр «Все / Непрочитанные»,
 * текстовый поиск, снимок непрочитанных, счётчик.
 */

import { useState, useCallback, useMemo } from 'react'
import type { InboxThreadEntry } from '@/services/api/inboxService'

export type InboxFilter = 'all' | 'unread' | 'awaiting' | 'needs_reply'

/** Ключ сортировки треда — как в RPC: max(last_message_at, last_event_at). */
function sortKey(c: InboxThreadEntry): number {
  const m = c.last_message_at ? Date.parse(c.last_message_at) : 0
  const e = c.last_event_at ? Date.parse(c.last_event_at) : 0
  return Math.max(m, e)
}

/**
 * @param chats — пагинированный список инбокса (вкладка «Все», keyset-страницы).
 * @param unreadChats — все непрочитанные одним запросом (вкладка «Непрочитанные»).
 *   Отдельный источник, чтобы вкладка не зависела от прокрутки и не каскадила догрузку.
 * @param awaitingChats — все треды «Ждём клиента» одним запросом: внешние диалоги,
 *   где последними писали мы и всё прочитано. Без пагинации (см. unread).
 * @param needsReplyChats — все треды «Нужно ответить»: внешние диалоги, где
 *   последним писал клиент и всё прочитано. Без пагинации.
 */
export function useInboxFilters(
  chats: InboxThreadEntry[],
  unreadChats: InboxThreadEntry[],
  awaitingChats: InboxThreadEntry[],
  needsReplyChats: InboxThreadEntry[],
) {
  const [filter, setFilter] = useState<InboxFilter>('unread')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  // Снимок непрочитанных при входе на вкладку — чтобы прочитанный тред не исчезал
  // мгновенно, пока пользователь остаётся на «Непрочитанных». Храним сами записи:
  // прочитанный тред выпадает из unreadChats, и без снимка его данные негде взять.
  const [unreadSnapshot, setUnreadSnapshot] = useState<Map<string, InboxThreadEntry> | null>(null)

  // Сброс снимка при смене фильтра; при включении unread — делаем снимок
  const handleSetFilter = useCallback(
    (f: InboxFilter) => {
      if (f === 'unread') {
        const snap = new Map<string, InboxThreadEntry>()
        for (const c of unreadChats) snap.set(c.thread_id, c)
        setUnreadSnapshot(snap)
      } else {
        setUnreadSnapshot(null)
      }
      setFilter(f)
    },
    [unreadChats],
  )

  // Фильтрация и поиск
  const filteredChats = useMemo(() => {
    let result: InboxThreadEntry[]

    if (filter === 'unread') {
      // Источник — полный список непрочитанных + «залипшие» прочитанные из снимка.
      const byId = new Map<string, InboxThreadEntry>()
      for (const c of unreadChats) byId.set(c.thread_id, c)
      if (unreadSnapshot) {
        for (const [id, c] of unreadSnapshot) if (!byId.has(id)) byId.set(id, c)
      }
      result = Array.from(byId.values()).sort((a, b) => sortKey(b) - sortKey(a))
    } else if (filter === 'awaiting') {
      // Полный список «Ждём клиента» одним запросом. Снимок не нужен — тред
      // уходит отсюда, когда собеседник ответит (последнее → входящее).
      result = [...awaitingChats].sort((a, b) => sortKey(b) - sortKey(a))
    } else if (filter === 'needs_reply') {
      // Полный список «Нужно ответить» одним запросом.
      result = [...needsReplyChats].sort((a, b) => sortKey(b) - sortKey(a))
    } else {
      result = chats
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
  }, [chats, unreadChats, awaitingChats, needsReplyChats, filter, searchQuery, unreadSnapshot])

  const unreadCount = useMemo(() => unreadChats.length, [unreadChats])
  const awaitingCount = useMemo(() => awaitingChats.length, [awaitingChats])
  const needsReplyCount = useMemo(() => needsReplyChats.length, [needsReplyChats])

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
    awaitingCount,
    needsReplyCount,
  }
}
