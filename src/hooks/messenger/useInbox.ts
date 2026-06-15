"use client"

/**
 * Хуки для раздела "Входящие" — список тредов и общий счётчик непрочитанных.
 *
 * Источник данных — пагинированный RPC `get_inbox_threads_page` через `useInfiniteQuery`
 * (фаза 2 пагинации, 2026-05-27). Возврат — флэт всех загруженных страниц как
 * `InboxThreadEntry[]`, чтобы существующие consumers (useFilteredInbox, useIsManuallyUnread
 * и др.) работали без изменений.
 *
 * Legacy `get_inbox_threads_v2` оставлен в БД для отката. `get_inbox_thread_aggregates`
 * (фаза 1) — отдельный лёгкий источник для бейджей сайдбара и favicon.
 *
 * Realtime-инвалидация ключа `inboxKeys.threads(workspaceId)` выполняется
 * в `useWorkspaceMessagesRealtime` (WorkspaceLayoutImpl) — единая
 * workspace-level подписка на `project_messages` / `message_reactions`.
 */

import { useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  getInboxThreadsPage,
  getInboxThreadAggregates,
  type InboxThreadEntry,
  type InboxThreadPageEntry,
  type InboxPageCursor,
  type InboxThreadsPage,
  type InboxThreadAggregate,
} from '@/services/api/inboxService'
import { inboxKeys, STALE_TIME } from '@/hooks/queryKeys'
import { calcThreadUnread } from '@/utils/inboxUnread'

// ─── Тип кэша + helpers для прямой работы с ним ──────────────────

/** Полный тип кэша инбокса в React Query (после перехода на infinite v5). */
export type InboxInfiniteData = InfiniteData<InboxThreadsPage, InboxPageCursor | undefined>

/** Стандартный селектор — флэтит страницы в массив тредов. */
function flattenPages(pages: InboxThreadsPage[]): InboxThreadEntry[] {
  const all: InboxThreadEntry[] = []
  for (const p of pages) all.push(...p.items)
  return all
}

/**
 * Достать плоский список тредов из кэша инбокса. Возвращает `undefined`,
 * если кэш ещё не заполнен (как старая семантика `getQueryData<InboxThreadEntry[]>`).
 */
export function readInboxFromCache(
  queryClient: QueryClient,
  workspaceId: string,
): InboxThreadEntry[] | undefined {
  const data = queryClient.getQueryData<InboxInfiniteData>(inboxKeys.threads(workspaceId))
  if (!data?.pages) return undefined
  return flattenPages(data.pages)
}

/**
 * Применить точечный апдейт к тредам в кэше инбокса. Сохраняет структуру
 * `{ pages, pageParams }`, чтобы пагинация продолжала работать. Если кэш
 * пуст — ничего не делает.
 *
 * Тип updater'а — `InboxThreadPageEntry` (с полем sort_at), но callers
 * обычно меняют только подмножество полей и копируют остальные через
 * spread — поэтому это совместимо с любым `InboxThreadEntry`-обновлением.
 */
export function patchInboxThreadInCache(
  queryClient: QueryClient,
  workspaceId: string,
  predicate: (t: InboxThreadPageEntry) => boolean,
  updater: (t: InboxThreadPageEntry) => InboxThreadPageEntry,
) {
  queryClient.setQueryData<InboxInfiniteData | undefined>(
    inboxKeys.threads(workspaceId),
    (prev) => {
      if (!prev?.pages) return prev
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.map((t) => (predicate(t) ? updater(t) : t)),
        })),
      }
    },
  )
}

/**
 * Применить точечный апдейт к лёгкому кэшу агрегатов (для сайдбар-бейджей).
 * Должен вызываться парно с `patchInboxThreadInCache` — иначе optimistic
 * mark-read обновит список тредов, но бейдж проекта в сайдбаре останется
 * висеть до полного refetch.
 */
export function patchInboxAggregateInCache(
  queryClient: QueryClient,
  workspaceId: string,
  predicate: (t: InboxThreadAggregate) => boolean,
  updater: (t: InboxThreadAggregate) => InboxThreadAggregate,
) {
  queryClient.setQueryData<InboxThreadAggregate[] | undefined>(
    inboxKeys.aggregates(workspaceId),
    (prev) => {
      if (!prev) return prev
      return prev.map((t) => (predicate(t) ? updater(t) : t))
    },
  )
}

/**
 * Удалить тред из кэша инбокса (для удалённых is_deleted тредов — сервер их
 * исключает из RPC, поэтому строку можно убрать сразу). Сохраняет структуру
 * `{ pages, pageParams }`; пустые страницы НЕ удаляются — иначе курсоры
 * пагинации (nextCursor у lastPage) рассинхронизируются. Если кэш пуст —
 * no-op.
 */
export function removeInboxThreadFromCache(
  queryClient: QueryClient,
  workspaceId: string,
  threadId: string,
) {
  queryClient.setQueryData<InboxInfiniteData | undefined>(
    inboxKeys.threads(workspaceId),
    (prev) => {
      if (!prev?.pages) return prev
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.filter((t) => t.thread_id !== threadId),
        })),
      }
    },
  )
}

/** Удалить тред из лёгкого кэша агрегатов. Парный к removeInboxThreadFromCache. */
export function removeInboxAggregateFromCache(
  queryClient: QueryClient,
  workspaceId: string,
  threadId: string,
) {
  queryClient.setQueryData<InboxThreadAggregate[] | undefined>(
    inboxKeys.aggregates(workspaceId),
    (prev) => (prev ? prev.filter((t) => t.thread_id !== threadId) : prev),
  )
}

function useInboxBase<T = InboxThreadEntry[]>(
  workspaceId: string,
  select?: (threads: InboxThreadEntry[]) => T,
) {
  const { user } = useAuth()

  return useInfiniteQuery({
    queryKey: inboxKeys.threads(workspaceId),
    queryFn: ({ pageParam }) =>
      getInboxThreadsPage(workspaceId, user!.id, pageParam as InboxPageCursor),
    // TanStack Query v5: initialPageParam обязателен. undefined трактуется
    // как «первая страница без курсора» — getInboxThreadsPage сам приведёт к NULL.
    initialPageParam: undefined as InboxPageCursor | undefined,
    // TanStack ожидает undefined для «нет следующей» — null допустим, но undefined чище.
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: (raw) => {
      // На начальной фазе и при refetch TanStack может вызвать select раньше,
      // чем data собрана — защищаемся от undefined/частичных pages.
      const pages = raw?.pages ?? []
      const flat = flattenPages(pages)
      return (select ? select(flat) : flat) as T
    },
  })
}

/**
 * База для per-thread/per-project unread-хуков поверх ПОЛНОГО кэша агрегатов
 * (`inboxKeys.aggregates`, RPC `get_inbox_thread_aggregates` — без пагинации).
 *
 * ⚠️ Раньше эти хуки сидели на `useInboxBase` (пагинированный `inboxKeys.threads`,
 * только загруженные ~50 тредов) → для треда со 2-й+ страницы инбокса возвращали
 * 0/false: бейдж пропадал, а кнопка «Прочитано/Непрочитано» показывала
 * «Непрочитано» при наличии непрочитанных. Агрегаты — полный список, наполняется
 * сайдбаром на каждой странице и патчится теми же mark-read/unread мутациями
 * (`patchInboxAggregateInCache`) → мгновенная реакция на чтение. Тот же кэш, что
 * читает `UnreadBadge`. Запрос дедупится с сайдбаром (один queryKey).
 */
function useInboxAggregatesBase<T = InboxThreadAggregate[]>(
  workspaceId: string,
  select?: (rows: InboxThreadAggregate[]) => T,
) {
  const { user } = useAuth()
  return useQuery({
    queryKey: inboxKeys.aggregates(workspaceId),
    queryFn: () => getInboxThreadAggregates(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
    select: select ? (rows) => select(rows ?? []) : undefined,
  })
}

/**
 * Список тредов с инфинит-скроллом. Возвращает `fetchNextPage`, `hasNextPage`,
 * `isFetchingNextPage` помимо стандартного `data`. Использовать для UI с прокруткой
 * (InboxPage, BoardTabContent inbox-колонки).
 *
 * Для счётчиков и проверок (useIsManuallyUnread, useTotalUnreadCount и т.д.)
 * остаётся `useInboxThreadsV2`, который флэтит загруженные страницы.
 */
export function useInboxThreadsInfinite(workspaceId: string) {
  return useInboxBase(workspaceId)
}

// ─── v2: тред-ориентированные хуки ──────────────────────────────

/**
 * Список тредов v2 — каждый тред отдельной строкой, с channel_type и
 * email-данными. Основа для всех производных хуков ниже.
 */
export function useInboxThreadsV2(workspaceId: string) {
  return useInboxBase(workspaceId)
}

/**
 * Проверяет, помечен ли тред/проект как вручную непрочитанный.
 *
 * Если передан `threadId` — проверяет конкретный тред.
 * Иначе — проверяет, есть ли в проекте `projectId` хоть один тред с
 * `legacy_channel === channel`, у которого `manually_unread === true`.
 */
export function useIsManuallyUnread(
  workspaceId: string,
  projectId: string,
  channel: 'client' | 'internal' = 'client',
  threadId?: string,
) {
  return useInboxAggregatesBase(workspaceId, (threads) => {
    if (threadId) {
      return threads.some((t) => t.thread_id === threadId && t.manually_unread)
    }
    return threads.some(
      (t) =>
        t.project_id === projectId &&
        t.legacy_channel === channel &&
        t.manually_unread,
    )
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
  return useInboxAggregatesBase(workspaceId, (threads) => {
    if (threadId) {
      return threads.some((t) => t.thread_id === threadId && t.has_unread_reaction)
    }
    return threads.some(
      (t) =>
        t.project_id === projectId &&
        t.legacy_channel === channel &&
        t.has_unread_reaction,
    )
  })
}

/**
 * Сколько непрочитанных реакций у конкретного треда/проекта (канал 'client').
 * Нужно для бейджа: при 2+ реакциях показывать цифру, а не эмодзи.
 */
export function useUnreadReactionCount(
  workspaceId: string,
  projectId: string,
  channel: 'client' | 'internal' = 'client',
  threadId?: string,
) {
  return useInboxBase(workspaceId, (threads) => {
    let total = 0
    for (const t of threads) {
      const match = threadId
        ? t.thread_id === threadId
        : t.project_id === projectId && t.legacy_channel === channel
      if (match) total += t.unread_reaction_count ?? (t.has_unread_reaction ? 1 : 0)
    }
    return total
  })
}

/**
 * Количество непрочитанных audit-событий треда (создание, смена статуса и т.д.).
 * Нужно для ReadUnreadButton, иначе кнопка показывает «Непрочитано» даже когда
 * в инбоксе висит бейдж по событию.
 */
export function useUnreadEventCount(workspaceId: string, threadId?: string) {
  return useInboxAggregatesBase(workspaceId, (threads) => {
    if (!threadId) return 0
    const t = threads.find((t) => t.thread_id === threadId)
    return t?.unread_event_count ?? 0
  })
}

/**
 * Emoji непрочитанной реакции для конкретного проекта (канал 'client').
 * Возвращает первый найденный emoji среди client-тредов проекта с реакцией.
 */
export function useUnreadReactionEmoji(workspaceId: string, projectId: string) {
  return useInboxBase(workspaceId, (threads) => {
    const thread = threads.find(
      (t) =>
        t.project_id === projectId &&
        t.legacy_channel === 'client' &&
        t.has_unread_reaction &&
        t.last_reaction_emoji,
    )
    return thread?.last_reaction_emoji ?? null
  })
}

/**
 * Счётчик непрочитанных по каждому проекту (для бейджей в сайдбаре).
 * Агрегирует thread-level данные v2 в project-level map-ы.
 */
export function useProjectUnreadCounts(workspaceId: string) {
  return useInboxBase(workspaceId, (threads) => {
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
          badgeColorMap.set(pid, thread.thread_accent_color ?? 'blue')
        } else if (currentColor !== 'amber' && currentColor !== thread.thread_accent_color) {
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
  })
}
