"use client"

/**
 * Хуки для счётчика непрочитанных и пометки прочитанного.
 * После audit S1 cleanup: threadId обязательный, legacy-режим удалён.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  markAsRead,
  markAsUnread,
  resolveParticipantId,
  type MessageChannel,
} from '@/services/api/messenger/messengerService'
import { getInboxThreadOne, getInboxThreadAggregates } from '@/services/api/inboxService'
import { supabase } from '@/lib/supabase'
import {
  messengerKeys,
  inboxKeys,
  invalidateMessengerCaches,
  STALE_TIME,
} from '@/hooks/queryKeys'
import { patchInboxThreadInCache, patchInboxAggregateInCache } from './useInbox'
import { dismissProjectToasts } from './useMessageToastPayload'

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
    // ВАЖНО: useLastReadAt читает last_read_at ИЗ inbox-кэша (через
    // useInboxThreadsV2.data.find(...).last_read_at), а не из отдельного ключа
    // messengerKeys.lastReadAtByThreadId. Поэтому красный контур у бабблов
    // в треде = inbox-кэш.last_read_at, и без обновления этого поля контур
    // держится до refetch (3-4 сек). Симметрично для агрегатов — если их
    // структура содержит last_read_at, бейдж сайдбара/проекта тоже обновится.
    patchInboxThreadInCache(
      queryClient,
      workspaceId,
      (t) => t.thread_id === threadId,
      (t) => ({
        ...t,
        last_read_at: nowIso,
        unread_count: 0,
        manually_unread: false,
        has_unread_reaction: false,
        unread_reaction_count: 0,
        unread_event_count: 0,
      }),
    )
    // Зеркальный патч лёгкого кэша агрегатов — бейдж проекта в сайдбаре
    // и favicon обновляются в той же фазе render, что и сам тред в списке.
    patchInboxAggregateInCache(
      queryClient,
      workspaceId,
      (t) => t.thread_id === threadId,
      (t) => ({
        ...t,
        last_read_at: nowIso,
        unread_count: 0,
        manually_unread: false,
        has_unread_reaction: false,
        unread_reaction_count: 0,
        unread_event_count: 0,
      }),
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
    // last_read_at в inbox-кэше зеркалит messengerKeys.lastReadAtByThreadId —
    // useLastReadAt читает именно отсюда, см. комментарий в patchCachesForMarkRead.
    patchInboxThreadInCache(
      queryClient,
      workspaceId,
      (t) => t.thread_id === threadId,
      (t) => ({ ...t, last_read_at: nowIso, manually_unread: true }),
    )
    patchInboxAggregateInCache(
      queryClient,
      workspaceId,
      (t) => t.thread_id === threadId,
      (t) => ({ ...t, last_read_at: nowIso, manually_unread: true }),
    )
  }
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
  // ⚠️ Источник — ПОЛНЫЙ кэш агрегатов (inboxKeys.aggregates), а НЕ пагинированный
  // useInboxThreadsV2 (только первые ~50 тредов). Для треда со 2-й+ страницы
  // инбокса find возвращал undefined → unread_count=0 → кнопка «Прочитано/
  // Непрочитано» показывала «Непрочитано» при наличии непрочитанных. Агрегаты
  // полные, наполняются сайдбаром и патчатся mark-read (patchInboxAggregateInCache).
  const { user } = useAuth()
  const query = useQuery({
    queryKey: inboxKeys.aggregates(workspaceId),
    queryFn: () => getInboxThreadAggregates(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: (rows) =>
      threadId ? rows.find((t) => t.thread_id === threadId)?.unread_count ?? 0 : 0,
  })
  return { ...query, data: query.data ?? 0 }
}

/**
 * useLastReadAt — граница «прочитанного» для ОТКРЫТОГО треда (красный контур
 * непрачитанных бабблов в MessageList).
 *
 * ВАЖНО: НЕ читаем из useInboxThreadsV2 — после перехода инбокса на keyset-
 * пагинацию этот список содержит только загруженные страницы. Для треда за их
 * пределами `find` возвращал undefined → last_read_at = null → MessageList красил
 * ВСЕ чужие сообщения как непрочитанные, хотя на сервере тред прочитан.
 *
 * Теперь — точечный запрос по thread_id (RPC get_inbox_thread_one), на ключе
 * `messengerKeys.lastReadAtByThreadId`, который уже патчат все mark-read мутации
 * (patchCachesForMarkRead, useNewMessageToast, useDelayedSend, ...) → контур
 * исчезает мгновенно при прочтении/отправке.
 */
export function useLastReadAt(
  workspaceId: string,
  threadId: string | undefined,
) {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: messengerKeys.lastReadAtByThreadId(threadId ?? '__none__'),
    queryFn: async (): Promise<string | null> => {
      const row = await getInboxThreadOne(workspaceId, user!.id, threadId!)
      return row?.last_read_at ?? null
    },
    enabled: !!workspaceId && !!user && !!threadId,
    staleTime: STALE_TIME.SHORT,
  })
  return { ...query, data: query.data ?? null, isPending: query.isPending }
}

/**
 * Snapshot всех кэшей, которые патчатся в patchCachesForMarkRead/Unread.
 * Нужен для rollback в onError, если запрос в БД упадёт после оптимистичного
 * patch'а в onMutate.
 */
function snapshotMarkCaches(
  queryClient: QueryClient,
  threadId: string,
  workspaceId: string | undefined,
) {
  return {
    unreadCount: queryClient.getQueryData(messengerKeys.unreadCountByThreadId(threadId)),
    lastReadAt: queryClient.getQueryData(messengerKeys.lastReadAtByThreadId(threadId)),
    inboxThreads: workspaceId
      ? queryClient.getQueryData(inboxKeys.threads(workspaceId))
      : undefined,
    inboxAggregates: workspaceId
      ? queryClient.getQueryData(inboxKeys.aggregates(workspaceId))
      : undefined,
  }
}

function restoreMarkCaches(
  queryClient: QueryClient,
  threadId: string,
  workspaceId: string | undefined,
  snap: ReturnType<typeof snapshotMarkCaches>,
) {
  queryClient.setQueryData(messengerKeys.unreadCountByThreadId(threadId), snap.unreadCount)
  queryClient.setQueryData(messengerKeys.lastReadAtByThreadId(threadId), snap.lastReadAt)
  if (workspaceId) {
    queryClient.setQueryData(inboxKeys.threads(workspaceId), snap.inboxThreads)
    queryClient.setQueryData(inboxKeys.aggregates(workspaceId), snap.inboxAggregates)
  }
}

/**
 * Инвалидации после успешного mark-as-read: догоняем БД, фиксируем snapshot.
 * Отдельная функция (раньше — вторая половина applyOptimisticMarkRead),
 * потому что patch теперь делается в onMutate, не в onSuccess.
 */
function invalidateAfterMarkRead(
  queryClient: QueryClient,
  params: CachePatchParams,
) {
  const { threadId, projectId, workspaceId } = params
  queryClient.invalidateQueries({ queryKey: messengerKeys.lastReadAtByThreadId(threadId) })
  if (projectId) {
    queryClient.invalidateQueries({
      queryKey: messengerKeys.lastReadAtByProjectPrefix(projectId),
    })
  }
  if (workspaceId) invalidateMessengerCaches(queryClient, workspaceId)
  if (projectId) dismissProjectToasts(projectId)
}

function invalidateAfterMarkUnread(
  queryClient: QueryClient,
  params: CachePatchParams,
) {
  const { threadId, projectId, workspaceId } = params
  queryClient.invalidateQueries({ queryKey: messengerKeys.unreadCountByThreadId(threadId) })
  queryClient.invalidateQueries({ queryKey: messengerKeys.lastReadAtByThreadId(threadId) })
  if (projectId) {
    queryClient.invalidateQueries({
      queryKey: messengerKeys.lastReadAtByProjectPrefix(projectId),
    })
  }
  if (workspaceId) invalidateMessengerCaches(queryClient, workspaceId)
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
      const pid = participantId ?? (await resolveParticipantId(projectId, workspaceId, user.id))
      if (!pid) return
      return markAsRead(pid, projectId, channel, threadId)
    },
    // Раньше patch шёл в onSuccess — это давало 300-500 мс лаг до пропадания
    // красного контура у бабблов (полный round-trip к БД до обновления
    // lastReadAtByThreadId). Теперь patch в onMutate — UI обновляется
    // синхронно с кликом, как в useInboxMarkMutations.
    onMutate: () => {
      const snap = snapshotMarkCaches(queryClient, threadId, workspaceId)
      patchCachesForMarkRead(queryClient, { threadId, projectId, workspaceId })
      return snap
    },
    onSuccess: () => {
      invalidateAfterMarkRead(queryClient, { threadId, projectId, workspaceId })
    },
    onError: (_err, _vars, snap) => {
      if (snap) restoreMarkCaches(queryClient, threadId, workspaceId, snap)
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
      const pid = participantId ?? (await resolveParticipantId(projectId, workspaceId, user.id))
      if (!pid) return
      await markAsUnread(pid, projectId, channel, threadId)
      if (projectId) {
        await supabase
          .from('projects')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', projectId)
      }
    },
    onMutate: () => {
      const snap = snapshotMarkCaches(queryClient, threadId, workspaceId)
      patchCachesForMarkUnread(queryClient, { threadId, projectId, workspaceId })
      return snap
    },
    onSuccess: () => {
      invalidateAfterMarkUnread(queryClient, { threadId, projectId, workspaceId })
    },
    onError: (_err, _vars, snap) => {
      if (snap) restoreMarkCaches(queryClient, threadId, workspaceId, snap)
    },
  })
}
