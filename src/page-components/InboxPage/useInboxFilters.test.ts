/**
 * Тесты для useInboxFilters — логики вкладок «Все / Непрочитанные», поиска,
 * снимка непрочитанных и счётчика.
 *
 * Ключевое после рефакторинга 2026-06-01: вкладка «Непрочитанные» работает на
 * отдельном полном списке непрочитанных (unreadChats), а не на пагинированном
 * chats — иначе короткий после фильтра список запускал каскад догрузки инбокса.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInboxFilters } from './useInboxFilters'
import type { InboxThreadEntry } from '@/services/api/inboxService'

function entry(over: Partial<InboxThreadEntry> & { thread_id: string }): InboxThreadEntry {
  return {
    thread_name: over.thread_id,
    thread_icon: null,
    thread_accent_color: 'blue',
    thread_type: 'chat',
    project_id: null,
    project_name: null,
    channel_type: null,
    legacy_channel: 'client',
    last_message_at: null,
    last_message_text: null,
    last_message_attachment_name: null,
    last_message_attachment_count: 0,
    last_message_attachment_mime: null,
    last_sender_name: null,
    last_sender_avatar_url: null,
    unread_count: 0,
    manually_unread: false,
    has_unread_reaction: false,
    unread_reaction_count: 0,
    last_reaction_emoji: null,
    last_reaction_at: null,
    last_reaction_sender_name: null,
    last_reaction_sender_avatar_url: null,
    last_reaction_message_preview: null,
    email_contact: null,
    email_subject: null,
    last_event_at: null,
    last_event_text: null,
    last_event_status_color: null,
    unread_event_count: 0,
    counterpart_name: null,
    counterpart_avatar_url: null,
    last_read_at: null,
    ...over,
  } as InboxThreadEntry
}

describe('useInboxFilters', () => {
  const chats = [
    entry({ thread_id: 'a', last_message_at: '2026-06-01T10:00:00Z' }),
    entry({ thread_id: 'b', unread_count: 2, last_message_at: '2026-06-01T09:00:00Z' }),
    entry({ thread_id: 'c', last_message_at: '2026-06-01T08:00:00Z' }),
  ]
  const unread = [
    entry({ thread_id: 'b', unread_count: 2, last_message_at: '2026-06-01T09:00:00Z' }),
    entry({ thread_id: 'x', unread_count: 1, last_message_at: '2026-06-01T12:00:00Z' }),
  ]
  const awaiting = [
    entry({ thread_id: 'w1', last_message_at: '2026-06-01T07:00:00Z' }),
    entry({ thread_id: 'w2', last_message_at: '2026-06-01T11:00:00Z' }),
  ]
  const needs = [
    entry({ thread_id: 'n1', last_message_at: '2026-06-01T06:00:00Z' }),
    entry({ thread_id: 'n2', last_message_at: '2026-06-01T13:00:00Z' }),
  ]

  it('по умолчанию вкладка «unread» и источник — unreadChats, не chats', () => {
    const { result } = renderHook(() => useInboxFilters(chats, unread, awaiting, needs))
    expect(result.current.filter).toBe('unread')
    const ids = result.current.filteredChats.map((c) => c.thread_id)
    // только непрочитанные (b, x), отсортированы по дате убыв. (x новее b)
    expect(ids).toEqual(['x', 'b'])
  })

  it('unreadCount берётся из полного unreadChats, не зависит от загруженных chats', () => {
    const { result } = renderHook(() => useInboxFilters(chats, unread, awaiting, needs))
    expect(result.current.unreadCount).toBe(2)
  })

  it('на вкладке «all» источник — полный пагинированный chats', () => {
    const { result } = renderHook(() => useInboxFilters(chats, unread, awaiting, needs))
    act(() => result.current.handleSetFilter('all'))
    expect(result.current.filteredChats.map((c) => c.thread_id)).toEqual(['a', 'b', 'c'])
  })

  it('снимок: прочитанный тред остаётся видимым, пока не уходим с вкладки', () => {
    const { result, rerender } = renderHook(
      ({ u }: { u: InboxThreadEntry[] }) => useInboxFilters(chats, u, awaiting, needs),
      { initialProps: { u: unread } },
    )
    // входим на вкладку — снимаем снимок текущих непрочитанных (b, x)
    act(() => result.current.handleSetFilter('unread'))
    // тред b прочитан → выпал из unreadChats
    rerender({ u: [entry({ thread_id: 'x', unread_count: 1, last_message_at: '2026-06-01T12:00:00Z' })] })
    const ids = result.current.filteredChats.map((c) => c.thread_id)
    // b «залип» из снимка, x остался непрочитанным
    expect(ids).toContain('b')
    expect(ids).toContain('x')
  })

  it('вкладка «awaiting» — источник awaitingChats, сортировка по дате убыв.', () => {
    const { result } = renderHook(() => useInboxFilters(chats, unread, awaiting, needs))
    expect(result.current.awaitingCount).toBe(2)
    act(() => result.current.handleSetFilter('awaiting'))
    // w2 (11:00) новее w1 (07:00)
    expect(result.current.filteredChats.map((c) => c.thread_id)).toEqual(['w2', 'w1'])
  })

  it('вкладка «needs_reply» — источник needsReplyChats, сортировка по дате убыв.', () => {
    const { result } = renderHook(() => useInboxFilters(chats, unread, awaiting, needs))
    expect(result.current.needsReplyCount).toBe(2)
    act(() => result.current.handleSetFilter('needs_reply'))
    // n2 (13:00) новее n1 (06:00)
    expect(result.current.filteredChats.map((c) => c.thread_id)).toEqual(['n2', 'n1'])
  })

  it('поиск фильтрует по имени треда', () => {
    const named = [
      entry({ thread_id: '1', thread_name: 'Договор', unread_count: 1 }),
      entry({ thread_id: '2', thread_name: 'Счёт', unread_count: 1 }),
    ]
    const { result } = renderHook(() => useInboxFilters(named, named, awaiting, needs))
    act(() => result.current.setSearchQuery('счёт'))
    expect(result.current.filteredChats.map((c) => c.thread_id)).toEqual(['2'])
  })
})
