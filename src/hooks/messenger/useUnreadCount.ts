"use client"

/**
 * Хуки для счётчика непрочитанных и пометки прочитанного.
 * После audit S1 cleanup: threadId обязательный, legacy-режим удалён.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  getUnreadCount,
  getLastReadAt,
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
  STALE_TIME,
} from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
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

interface CachePatchParams {
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
 * useUnreadCount / useLastReadAt — read-only query-хуки.
 *
 * threadId опциональный, потому что в нескольких местах (например,
 * useMessengerPanelData) они вызываются для client/internal-треда проекта,
 * а тред может ещё не существовать. В этом случае query отключается через
 * enabled. Мутации (useMarkAsRead, useMarkAsUnread) требуют threadId строго.
 */
export function useUnreadCount(
  projectId: string | undefined,
  channel: MessageChannel,
  participantId: string | undefined,
  threadId: string | undefined,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: threadId
      ? messengerKeys.unreadCountByThreadId(threadId)
      : ['messenger', 'unread-count', 'no-thread'],
    queryFn: async () => {
      if (!user || !threadId) return 0
      const pid =
        participantId ?? (await getCurrentProjectParticipant(projectId!, user.id))?.participantId
      if (!pid) return 0
      return getUnreadCount(pid, projectId, channel, threadId)
    },
    // Если participantId ещё не подъехал и нет projectId для fallback'а —
    // не запускаем queryFn, чтобы не затереть значение, которое сидирует
    // useChatState. Без этого фикса на холодном reload queryFn возвращал 0,
    // а позже setQueryData из useChatState клал настоящее значение —
    // но queryFn мог отрезолвиться позже и перезаписать его нулём.
    enabled: !!user && !!threadId && (!!participantId || !!projectId),
    staleTime: STALE_TIME.SHORT,
  })
}

export function useLastReadAt(
  projectId: string | undefined,
  channel: MessageChannel,
  participantId: string | undefined,
  threadId: string | undefined,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: threadId
      ? messengerKeys.lastReadAtByThreadId(threadId)
      : ['messenger', 'last-read-at', 'no-thread'],
    queryFn: async () => {
      if (!user || !threadId) return null
      const pid =
        participantId ?? (await getCurrentProjectParticipant(projectId!, user.id))?.participantId
      if (!pid) return null
      return getLastReadAt(pid, projectId, channel, threadId)
    },
    // Та же логика, что в useUnreadCount: пока participantId не подъехал
    // и нет projectId для fallback'а — не запускаем queryFn. Иначе на
    // холодном reload queryFn возвращал null, перезаписывая значение,
    // которое сидировал useChatState. С null'овым lastReadAt MessageList
    // помечал все чужие сообщения как непрочитанные.
    enabled: !!user && !!threadId && (!!participantId || !!projectId),
    staleTime: STALE_TIME.SHORT,
  })
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
