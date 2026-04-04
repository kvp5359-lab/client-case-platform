"use client"

/**
 * Хуки для раздела "Входящие" — список тредов и общий счётчик непрочитанных.
 *
 * v1 хуки (useInboxThreads, useTotalUnreadCount, etc.) — оставлены для сайдбара, favicon и MessengerTabContent.
 * v2 хуки (useInboxThreadsV2) — новый формат: каждый тред = отдельная строка.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getInboxThreads, getInboxThreadsV2 } from '@/services/api/inboxService'
import { inboxKeys } from '@/hooks/queryKeys'

// ─── v2: тред-ориентированные хуки ───────────────────────────────

/** Список тредов v2 — каждый тред отдельной строкой, с channel_type и email-данными */
export function useInboxThreadsV2(workspaceId: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: 30_000,
  })

  // Realtime: новое сообщение или реакция → обновить список чатов
  useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`inbox-v2:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threadsV2(workspaceId) })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, queryClient])

  return query
}

// ─── v1: project-ориентированные хуки (для сайдбара, favicon) ───

/** Список тредов-проектов с последним сообщением и непрочитанными */
export function useInboxThreads(workspaceId: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: inboxKeys.threads(workspaceId),
    queryFn: () => getInboxThreads(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: 30_000,
  })

  // Realtime: новое сообщение или реакция → обновить список чатов
  useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`inbox:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, queryClient])

  return query
}

/** Суммарный счётчик непрочитанных сообщений для бейджа favicon и сайдбара (v2: по тредам) */
export function useTotalUnreadCount(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: 30_000,
    select: (threads) => {
      let count = 0
      for (const thread of threads) {
        const total = thread.unread_count + (thread.has_unread_reaction ? 1 : 0)
        if (total > 0) {
          count += total
        } else if (thread.manually_unread) {
          count++
        }
      }
      return count
    },
  })
}

/** Проверяет, помечен ли тред/проект как вручную непрочитанный.
 *  Если передан threadId — использует v2 (по тредам), иначе v1 (по проектам). */
export function useIsManuallyUnread(
  workspaceId: string,
  projectId: string,
  channel: 'client' | 'internal' = 'client',
  threadId?: string,
) {
  const { user } = useAuth()

  // v2 path: filter by threadId directly
  const v2 = useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user && !!threadId,
    staleTime: 30_000,
    select: (threads) => threads.some((t) => t.thread_id === threadId && t.manually_unread),
  })

  // v1 fallback: filter by projectId + channel
  const v1 = useQuery({
    queryKey: inboxKeys.threads(workspaceId),
    queryFn: () => getInboxThreads(workspaceId, user!.id),
    enabled: !!workspaceId && !!user && !threadId,
    staleTime: 30_000,
    select: (chats) =>
      chats.some(
        (c) =>
          c.project_id === projectId &&
          (channel === 'client' ? c.manually_unread : c.internal_manually_unread),
      ),
  })

  return threadId ? v2 : v1
}

/** Есть ли непрочитанная реакция у конкретного треда/проекта.
 *  Если передан threadId — использует v2 (по тредам), иначе v1 (по проектам). */
export function useHasUnreadReaction(
  workspaceId: string,
  projectId: string,
  channel: 'client' | 'internal' = 'client',
  threadId?: string,
) {
  const { user } = useAuth()

  // v2 path: filter by threadId directly
  const v2 = useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user && !!threadId,
    staleTime: 30_000,
    select: (threads) => threads.some((t) => t.thread_id === threadId && t.has_unread_reaction),
  })

  // v1 fallback: filter by projectId + channel
  const v1 = useQuery({
    queryKey: inboxKeys.threads(workspaceId),
    queryFn: () => getInboxThreads(workspaceId, user!.id),
    enabled: !!workspaceId && !!user && !threadId,
    staleTime: 30_000,
    select: (chats) =>
      chats.some(
        (c) => c.project_id === projectId && channel === 'client' && c.has_unread_reaction,
      ),
  })

  return threadId ? v2 : v1
}

/** Emoji непрочитанной реакции для конкретного проекта */
export function useUnreadReactionEmoji(workspaceId: string, projectId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threads(workspaceId),
    queryFn: () => getInboxThreads(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: 30_000,
    select: (chats) => {
      const chat = chats.find((c) => c.project_id === projectId)
      return chat?.has_unread_reaction && chat.last_reaction_emoji ? chat.last_reaction_emoji : null
    },
  })
}

/** Счётчик непрочитанных по каждому проекту (для бейджей в сайдбаре).
 *  Использует v2 (по тредам) — корректно учитывает задачи и accent_color каждого треда. */
export function useProjectUnreadCounts(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: 30_000,
    select: (threads) => {
      // Значение > 0 — реальные непрочитанные (показать число)
      // Значение -1 — manually_unread без сообщений (показать точку без числа)
      // Реакция = +1 к числу непрочитанных
      const map = new Map<string, number>()
      const clientMap = new Map<string, number>()
      const internalMap = new Map<string, number>()
      const reactionEmojiMap = new Map<string, string>()
      const reactionOnlyProjects = new Set<string>()
      const threadIdMap = new Map<string, { client: string | null; internal: string | null }>()
      const badgeColorMap = new Map<string, string>()

      for (const thread of threads) {
        if (!thread.project_id) continue
        const pid = thread.project_id
        const isClient = thread.legacy_channel === 'client'
        const isInternal = thread.legacy_channel === 'internal'
        const count = thread.unread_count + (thread.has_unread_reaction ? 1 : 0)
        const hasAny = count > 0 || thread.manually_unread

        // Суммарные непрочитанные по проекту
        if (count > 0) {
          map.set(pid, (map.get(pid) ?? 0) + count)
        } else if (thread.manually_unread && !map.has(pid)) {
          map.set(pid, -1)
        }

        // По каналам (client/internal) — для навигации при клике
        if (isClient) {
          if (count > 0) clientMap.set(pid, (clientMap.get(pid) ?? 0) + count)
          else if (thread.manually_unread && !clientMap.has(pid)) clientMap.set(pid, -1)
        } else if (isInternal) {
          if (count > 0) internalMap.set(pid, (internalMap.get(pid) ?? 0) + count)
          else if (thread.manually_unread && !internalMap.has(pid)) internalMap.set(pid, -1)
        }

        // Реакции
        if (thread.has_unread_reaction && thread.last_reaction_emoji && isClient) {
          reactionEmojiMap.set(pid, thread.last_reaction_emoji)
          if (thread.unread_count === 0) {
            reactionOnlyProjects.add(pid)
          }
        }

        // ThreadId маппинг (legacy каналы)
        if (isClient || isInternal) {
          const existing = threadIdMap.get(pid) ?? { client: null, internal: null }
          if (isClient) existing.client = thread.thread_id
          if (isInternal) existing.internal = thread.thread_id
          threadIdMap.set(pid, existing)
        }

        // Цвет бейджа: accent_color треда с непрочитанными
        if (hasAny) {
          const currentColor = badgeColorMap.get(pid)
          if (!currentColor) {
            // Первый непрочитанный тред — его цвет
            badgeColorMap.set(pid, thread.thread_accent_color ?? 'blue')
          } else if (currentColor !== 'amber' && currentColor !== thread.thread_accent_color) {
            // Несколько тредов с разными цветами → amber
            badgeColorMap.set(pid, 'amber')
          }
        }
      }
      return {
        unreadCounts: map,
        clientUnreadCounts: clientMap,
        internalUnreadCounts: internalMap,
        reactionEmojis: reactionEmojiMap,
        reactionOnlyProjects,
        threadIds: threadIdMap,
        badgeColors: badgeColorMap,
      }
    },
  })
}
