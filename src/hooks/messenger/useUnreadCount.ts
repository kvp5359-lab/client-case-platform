"use client"

/**
 * Хуки для счётчика непрочитанных и пометки прочитанного.
 * После audit S1 cleanup: threadId обязательный, legacy-режим удалён.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  markAsRead,
  markAsUnread,
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { supabase } from '@/lib/supabase'
import {
  messengerKeys,
  inboxKeys,
  invalidateMessengerCaches,
} from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import { useInboxThreadsV2 } from './useInbox'
import { dismissProjectToasts } from './useMessageToastPayload'

/** Resolve participant: project-level if projectId given, else workspace-level */
export async function resolveParticipant(
  projectId: string | undefined,
  workspaceId: string | undefined,
  userId: string,
) {
  if (projectId) {
    return (await getCurrentProjectParticipant(projectId, userId))?.participantId ?? null
  }
  if (workspaceId) {
    return (await getCurrentWorkspaceParticipant(workspaceId, userId))?.participantId ?? null
  }
  return null
}

type CachePatchParams = {
  threadId: string
  projectId?: string | undefined
  workspaceId?: string | undefined
}

/**
 * Pure-патч кэшей React Query, описывающий состояние «всё прочитано» в треде.
 * НЕ инвалидирует — это делает caller.
 *
 * Обновляет ОДНИМ махом ТРИ кэша, на которых живёт UI:
 *   1. `messengerKeys.unreadCountByThreadId`  — кнопка «Прочитано/Непрочитано»
 *   2. `messengerKeys.lastReadAtByThreadId`   — красный контур у бабблов
 *   3. `inboxKeys.threads(workspaceId)`       — бейдж списка «Входящие»
 *
 * Без этой общей функции список (✓✓-клик) патчил только #1 и #3, а #2
 * оставался старым → у уже открытого треда контуры держались до рефетча.
 */
export function patchCachesForMarkRead(queryClient: QueryClient, params: CachePatchParams) {
  const { threadId, workspaceId } = params
  const nowIso = new Date().toISOString()
  queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), 0)
  queryClient.setQueryData(messengerKeys.lastReadAtByThreadId(threadId), nowIso)
  if (workspaceId) {
    queryClient.setQueryData<InboxThreadEntry[] | undefined>(
      inboxKeys.threads(workspaceId),
      (prev) =>
        prev?.map((t) =>
          t.thread_id === threadId
            ? {
                ...t,
                unread_count: 0,
                manually_unread: false,
                has_unread_reaction: false,
                unread_reaction_count: 0,
                unread_event_count: 0,
              }
            : t,
        ),
    )
  }
}

/** Зеркало `patchCachesForMarkRead` для «отметить непрочитанным» */
export function patchCachesForMarkUnread(queryClient: QueryClient, params: CachePatchParams) {
  const { threadId, workspaceId } = params
  const nowIso = new Date().toISOString()
  // lastReadAt = NOW: сообщения теряют красный контур (manually_unread даёт
  // бейдж списка, но конкретные сообщения не должны быть «непрочитанными»).
  queryClient.setQueryData(messengerKeys.lastReadAtByThreadId(threadId), nowIso)
  if (workspaceId) {
    queryClient.setQueryData<InboxThreadEntry[] | undefined>(
      inboxKeys.threads(workspaceId),
      (prev) =>
        prev?.map((t) =>
          t.thread_id === threadId ? { ...t, manually_unread: true } : t,
        ),
    )
  }
}

/**
 * Полный апдейт после успешного mark-as-read: optimistic patch + инвалидации.
 * Используется в `useMarkAsRead` (вызывается в `onSuccess` после upsert).
 */
export function applyOptimisticMarkRead(queryClient: QueryClient, params: CachePatchParams) {
  const { threadId, projectId, workspaceId } = params
  patchCachesForMarkRead(queryClient, params)
  queryClient.invalidateQueries({ queryKey: messengerKeys.lastReadAtByThreadId(threadId) })
  if (projectId) {
    queryClient.invalidateQueries({
      queryKey: messengerKeys.lastReadAtByProjectPrefix(projectId),
    })
  }
  if (workspaceId) invalidateMessengerCaches(queryClient, workspaceId)
  if (projectId) dismissProjectToasts(projectId)
}

/** Зеркало `applyOptimisticMarkRead` для «отметить непрочитанным» */
export function applyOptimisticMarkUnread(queryClient: QueryClient, params: CachePatchParams) {
  const { threadId, projectId, workspaceId } = params
  patchCachesForMarkUnread(queryClient, params)
  queryClient.invalidateQueries({ queryKey: messengerKeys.unreadCountByThreadId(threadId) })
  queryClient.invalidateQueries({ queryKey: messengerKeys.lastReadAtByThreadId(threadId) })
  if (projectId) {
    queryClient.invalidateQueries({
      queryKey: messengerKeys.lastReadAtByProjectPrefix(projectId),
    })
  }
  if (workspaceId) invalidateMessengerCaches(queryClient, workspaceId)
}

/**
 * useUnreadCount / useLastReadAt — read-only хуки, читают из ОДНОГО источника
 * правды: `inboxKeys.threads(workspaceId)` (RPC `get_inbox_threads_v2`).
 *
 * До унификации 2026-05-16 каждый хук дёргал свой RPC (`get_unread_messages_count`
 * и select по `message_read_status`). Из-за этого разные части UI расходились —
 * бейдж списка говорил «всё прочитано», а кнопка «Прочитано/Непрочитано»
 * в чате считала иначе. Теперь и бейдж, и кнопка, и красные контуры бабблов
 * читают из одной строки inbox v2 → расхождение невозможно.
 *
 * Мутации в `useMarkAsRead`/`useMarkAsUnread` / list-кликах `✓✓` патчат ту
 * же строку через `patchCachesForMarkRead/Unread` → визуальная синхронность
 * мгновенно. Инвалидация после upsert гарантирует, что мы сходимся с БД.
 *
 * `participantId` и `channel` остались в сигнатуре для обратной совместимости
 * с мутациями, но в read-хуках больше не используются (всё уже посчитано в RPC).
 */
export function useUnreadCount(
  workspaceId: string,
  threadId: string | undefined,
) {
  const query = useInboxThreadsV2(workspaceId)
  const value = threadId
    ? query.data?.find((t) => t.thread_id === threadId)?.unread_count ?? 0
    : 0
  return { ...query, data: value }
}

export function useLastReadAt(
  workspaceId: string,
  threadId: string | undefined,
) {
  const query = useInboxThreadsV2(workspaceId)
  const value: string | null = threadId
    ? query.data?.find((t) => t.thread_id === threadId)?.last_read_at ?? null
    : null
  return { ...query, data: value, isPending: query.isPending }
}

export function useMarkAsRead(
  projectId: string | undefined,
  workspaceId: string | undefined,
  channel: MessageChannel,
  participantId: string | undefined,
  threadId: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user) return
      const pid = participantId ?? (await resolveParticipant(projectId, workspaceId, user.id))
      if (!pid) return
      return markAsRead(pid, projectId, channel, threadId)
    },
    onSuccess: () => {
      applyOptimisticMarkRead(queryClient, { threadId, projectId, workspaceId })
    },
  })
}

export function useMarkAsUnread(
  projectId: string | undefined,
  workspaceId: string | undefined,
  channel: MessageChannel,
  participantId: string | undefined,
  threadId: string,
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user) return
      const pid = participantId ?? (await resolveParticipant(projectId, workspaceId, user.id))
      if (!pid) return
      await markAsUnread(pid, projectId, channel, threadId)
      if (projectId) {
        await supabase
          .from('projects')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', projectId)
      }
    },
    onSuccess: () => {
      applyOptimisticMarkUnread(queryClient, { threadId, projectId, workspaceId })
    },
  })
}
