"use client"

/**
 * Хуки для раздела "Входящие" — список тредов и общий счётчик непрочитанных.
 *
 * Единственный источник данных — v2 RPC `get_inbox_threads_v2` (каждый тред
 * отдельной строкой, thread-level модель). v1 RPC `get_inbox_threads` больше
 * не используется ни одним хуком; сам RPC остался в БД как legacy для
 * потенциального быстрого отката, но TS-код его не вызывает.
 *
 * Миграция с v1 на v2 завершена в рамках аудита 2026-04-11, П5.1.
 *
 * Realtime-инвалидация ключа `inboxKeys.threadsV2(workspaceId)` выполняется
 * в `useWorkspaceMessagesRealtime` (WorkspaceLayoutImpl) — единая
 * workspace-level подписка на `project_messages` / `message_reactions`.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getInboxThreadsV2 } from '@/services/api/inboxService'
import { inboxKeys, STALE_TIME } from '@/hooks/queryKeys'
import { calcTotalUnread, calcThreadUnread } from '@/utils/inboxUnread'

// ─── v2: тред-ориентированные хуки ───────────────────────────────

/**
 * Список тредов v2 — каждый тред отдельной строкой, с channel_type и
 * email-данными. Основа для всех производных хуков ниже.
 */
export function useInboxThreadsV2(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
  })
}

/**
 * Суммарный счётчик непрочитанных сообщений для бейджа favicon и сайдбара.
 * Суммируется по всем тредам воркспейса, `calcTotalUnread` учитывает
 * реакции, manually_unread и events.
 */
export function useTotalUnreadCount(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: (threads) => calcTotalUnread(threads),
  })
}

/**
 * Проверяет, помечен ли тред/проект как вручную непрочитанный.
 *
 * Если передан `threadId` — проверяет конкретный тред.
 * Иначе — проверяет, есть ли в проекте `projectId` хоть один тред с
 * `legacy_channel === channel`, у которого `manually_unread === true`.
 * (Нужно для legacy-кода сайдбара, где unread-состояние агрегируется
 * на уровне проект × канал.)
 */
export function useIsManuallyUnread(
  workspaceId: string,
  projectId: string,
  channel: 'client' | 'internal' = 'client',
  threadId?: string,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: (threads) => {
      if (threadId) {
        return threads.some((t) => t.thread_id === threadId && t.manually_unread)
      }
      return threads.some(
        (t) =>
          t.project_id === projectId &&
          t.legacy_channel === channel &&
          t.manually_unread,
      )
    },
  })
}

/**
 * Есть ли непрочитанная реакция у конкретного треда/проекта.
 * Семантика `threadId` / `projectId` — как в `useIsManuallyUnread`.
 */
export function useHasUnreadReaction(
  workspaceId: string,
  projectId: string,
  channel: 'client' | 'internal' = 'client',
  threadId?: string,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: (threads) => {
      if (threadId) {
        return threads.some((t) => t.thread_id === threadId && t.has_unread_reaction)
      }
      return threads.some(
        (t) =>
          t.project_id === projectId &&
          t.legacy_channel === channel &&
          t.has_unread_reaction,
      )
    },
  })
}

/**
 * Emoji непрочитанной реакции для конкретного проекта (канал 'client').
 * Возвращает первый найденный emoji среди client-тредов проекта с реакцией.
 */
export function useUnreadReactionEmoji(workspaceId: string, projectId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: (threads) => {
      const thread = threads.find(
        (t) =>
          t.project_id === projectId &&
          t.legacy_channel === 'client' &&
          t.has_unread_reaction &&
          t.last_reaction_emoji,
      )
      return thread?.last_reaction_emoji ?? null
    },
  })
}

/**
 * Счётчик непрочитанных по каждому проекту (для бейджей в сайдбаре).
 * Агрегирует thread-level данные v2 в project-level map-ы.
 */
export function useProjectUnreadCounts(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: inboxKeys.threadsV2(workspaceId),
    queryFn: () => getInboxThreadsV2(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
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
        const count = calcThreadUnread(thread)
        const hasAny = count !== 0

        // Суммарные непрочитанные по проекту
        if (count > 0) {
          map.set(pid, (map.get(pid) ?? 0) + count)
        } else if (count === -1 && !map.has(pid)) {
          map.set(pid, -1)
        }

        // По каналам (client/internal) — для навигации при клике
        if (isClient) {
          if (count > 0) clientMap.set(pid, (clientMap.get(pid) ?? 0) + count)
          else if (count === -1 && !clientMap.has(pid)) clientMap.set(pid, -1)
        } else if (isInternal) {
          if (count > 0) internalMap.set(pid, (internalMap.get(pid) ?? 0) + count)
          else if (count === -1 && !internalMap.has(pid)) internalMap.set(pid, -1)
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

