"use client"

/**
 * useFilteredInbox — единая точка входа для inbox-данных с фильтрацией по доступу.
 *
 * Заменяет прямое использование useInboxThreadsV2 во всех местах.
 * Фильтрует треды по правилам доступа (админ, исполнитель, access_roles, members, создатель).
 *
 * Используется в: сайдбаре, PanelTabs, InboxPage, FloatingPanelButtons, favicon.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { calcThreadUnread, calcTotalUnread, getAggregateBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import { canAccessThread, type ThreadAccessInfo } from '@/utils/threadAccess'
import { useInboxThreadsV2 } from './useInbox'
import {
  getInboxThreadAggregates,
  getInboxUnreadThreads,
  type InboxThreadAggregate,
} from '@/services/api/inboxService'
import { inboxKeys, sidebarDataKeys, STALE_TIME } from '@/hooks/queryKeys'

type MyProjectRole = {
  project_id: string
  participant_id: string
  project_roles: string[]
}

/**
 * Загружает данные о доступе для workspace-level фильтрации через единый RPC get_sidebar_data.
 * Один HTTP-запрос вместо 4 отдельных.
 */
function useWorkspaceAccessData(workspaceId: string) {
  const { user } = useAuth()

  const { data } = useQuery({
    queryKey: sidebarDataKeys.forUser(workspaceId, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sidebar_data' as never, {
        p_workspace_id: workspaceId,
        p_user_id: user!.id,
      } as never)
      if (error) throw error
      const result = data as unknown as {
        threads: ThreadAccessInfo[]
        myProjectRoles: MyProjectRole[]
        myMemberThreadIds: string[]
        myAssigneeThreadIds: string[]
      }
      return {
        threads: result.threads ?? [],
        myProjectRoles: result.myProjectRoles ?? [],
        myMemberThreadIds: new Set<string>(result.myMemberThreadIds ?? []),
        myAssigneeThreadIds: new Set<string>(result.myAssigneeThreadIds ?? []),
      }
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.STANDARD,
  })

  return {
    threads: data?.threads ?? [],
    myProjectRoles: data?.myProjectRoles ?? [],
    myMemberThreadIds: data?.myMemberThreadIds ?? new Set<string>(),
    myAssigneeThreadIds: data?.myAssigneeThreadIds ?? new Set<string>(),
  }
}

/**
 * useAccessFilter — общий движок фильтрации тредов по правам доступа.
 *
 * Применяет canAccessThread() ко всем элементам массива, используя access-данные
 * текущего пользователя из useWorkspaceAccessData (get_sidebar_data RPC).
 * Safety fallback: если для треда нет access-info — оставляем (не теряем счётчик).
 *
 * Тип T должен иметь thread_id. Используется и для тяжёлого InboxThreadEntry,
 * и для лёгкого InboxThreadAggregate.
 */
function useAccessFilter<T extends { thread_id: string }>(
  items: T[],
  workspaceId: string,
): T[] {
  const { user } = useAuth()
  const { threads, myProjectRoles, myMemberThreadIds, myAssigneeThreadIds } =
    useWorkspaceAccessData(workspaceId)

  const rolesByProject = useMemo(() => {
    const map = new Map<string, MyProjectRole>()
    for (const r of myProjectRoles) {
      map.set(r.project_id, r)
    }
    return map
  }, [myProjectRoles])

  const threadAccessMap = useMemo(() => {
    const map = new Map<string, ThreadAccessInfo>()
    for (const t of threads) {
      map.set(t.id, t)
    }
    return map
  }, [threads])

  return useMemo(() => {
    if (!user) return items

    return items.filter((entry) => {
      const access = threadAccessMap.get(entry.thread_id)
      if (!access) return true // safety fallback — не теряем строку из счётчика

      const myRole = access.project_id ? rolesByProject.get(access.project_id) : null

      return canAccessThread({
        thread: access,
        userId: user.id,
        participantId: myRole?.participant_id ?? null,
        projectRoles: myRole?.project_roles ?? null,
        isAssignee: myAssigneeThreadIds.has(entry.thread_id),
        isMember: myMemberThreadIds.has(entry.thread_id),
        hasViewAllProjects: false,
      })
    })
  }, [items, user, threadAccessMap, rolesByProject, myMemberThreadIds, myAssigneeThreadIds])
}

/**
 * useFilteredInboxAggregates — отфильтрованный по доступу список «лёгких» агрегатов
 * для счётчиков сайдбара и favicon. В отличие от useFilteredInbox не тянет
 * имена/тексты/аватары — payload в ~17 раз меньше, Postgres в ~2 раза быстрее.
 *
 * Источник — RPC `get_inbox_thread_aggregates`. Использование — только для
 * счётчиков; для UI-списка тредов остаётся useFilteredInbox.
 */
export function useFilteredInboxAggregates(workspaceId: string) {
  const { user } = useAuth()

  const { data: rawAggregates = [] } = useQuery({
    queryKey: inboxKeys.aggregates(workspaceId),
    queryFn: () => getInboxThreadAggregates(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
  })

  const data = useAccessFilter<InboxThreadAggregate>(rawAggregates, workspaceId)
  return { data }
}

/**
 * useFilteredInbox — возвращает отфильтрованный по доступу список inbox тредов.
 * Единая замена для useInboxThreadsV2 во всех компонентах.
 */
export function useFilteredInbox(workspaceId: string) {
  const { data: rawInboxThreads = [], ...queryRest } = useInboxThreadsV2(workspaceId)
  const data = useAccessFilter(rawInboxThreads, workspaceId)
  return { data, ...queryRest }
}

/**
 * useFilteredInboxUnread — все непрочитанные треды одним запросом (без пагинации),
 * отфильтрованные тем же access-фильтром, что и основной список.
 *
 * Источник вкладки «Непрочитанные». Раньше непрочитанные фильтровались на клиенте
 * поверх keyset-пагинации — короткий после фильтра список заставлял бесконечный
 * скролл прокачивать весь инбокс (каскад → подвисание «Загружаем ещё…»). Здесь
 * непрочитанные (их всегда единицы) приходят целиком одним вызовом RPC.
 */
export function useFilteredInboxUnread(workspaceId: string) {
  const { user } = useAuth()

  const { data: rawUnread = [], ...queryRest } = useQuery({
    queryKey: inboxKeys.unread(workspaceId),
    queryFn: () => getInboxUnreadThreads(workspaceId, user!.id),
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
  })

  const data = useAccessFilter(rawUnread, workspaceId)
  return { data, ...queryRest }
}

/**
 * useSidebarInboxCounts — единый расчёт счётчиков непрочитанных для сайдбара.
 * Заменяет связку useTotalFilteredUnreadCount + useProjectFilteredUnreadCounts:
 * раньше useFilteredInbox вычислялся дважды (useMemo-фильтрация гоняется дважды),
 * теперь всё делается в одном проходе.
 *
 * Источник — `useFilteredInboxAggregates` (лёгкий RPC `get_inbox_thread_aggregates`),
 * чтобы сайдбар не зависел от тяжёлого инбокс-запроса и оставался быстрым при
 * росте числа тредов / переходе списка инбокса на пагинацию (фаза 2).
 */
export function useSidebarInboxCounts(workspaceId: string) {
  const { data: threads } = useFilteredInboxAggregates(workspaceId)

  return useMemo(() => {
    const totalUnread = calcTotalUnread(threads)

    // Группируем треды по project_id
    const threadsByProject = new Map<string, typeof threads>()
    const clientUnreadCounts = new Map<string, number>()
    const internalUnreadCounts = new Map<string, number>()
    const threadIds = new Map<string, { client: string | null; internal: string | null }>()
    const badgeColors = new Map<string, string>()
    let unreadThreadsCount = 0
    let unreadPersonalDialogsCount = 0
    // Треды без project_id — для виртуальной записи «Без проекта» в сайдбаре.
    const noProjectThreads: typeof threads = []
    /** Максимум last_message_at среди тредов без project_id — для сортировки виртуала среди проектов. */
    let noProjectLastActivityMs = 0

    for (const t of threads) {
      const isClient = t.legacy_channel === 'client'
      const isInternal = t.legacy_channel === 'internal'
      const count = calcThreadUnread(t)
      const hasAny = count !== 0
      if (hasAny) unreadThreadsCount += 1
      // Личные диалоги — отдельный счётчик + копим список для bage виртуала.
      if (!t.project_id) {
        if (hasAny) unreadPersonalDialogsCount += 1
        noProjectThreads.push(t)
        if (t.last_message_at) {
          const ms = Date.parse(t.last_message_at)
          if (Number.isFinite(ms) && ms > noProjectLastActivityMs) noProjectLastActivityMs = ms
        }
        continue
      }
      const pid = t.project_id

      // Группируем для getAggregateBadgeDisplay
      if (!threadsByProject.has(pid)) threadsByProject.set(pid, [])
      threadsByProject.get(pid)!.push(t)

      // По каналам (client/internal) — для навигации при клике
      if (isClient) {
        if (count > 0) clientUnreadCounts.set(pid, (clientUnreadCounts.get(pid) ?? 0) + count)
        else if (count === -1 && !clientUnreadCounts.has(pid)) clientUnreadCounts.set(pid, -1)
      } else if (isInternal) {
        if (count > 0) internalUnreadCounts.set(pid, (internalUnreadCounts.get(pid) ?? 0) + count)
        else if (count === -1 && !internalUnreadCounts.has(pid))
          internalUnreadCounts.set(pid, -1)
      }

      // ThreadId маппинг (legacy каналы)
      if (isClient || isInternal) {
        const existing = threadIds.get(pid) ?? { client: null, internal: null }
        if (isClient) existing.client = t.thread_id
        if (isInternal) existing.internal = t.thread_id
        threadIds.set(pid, existing)
      }

      // Цвет бейджа: accent_color треда с непрочитанными
      if (hasAny) {
        const currentColor = badgeColors.get(pid)
        if (!currentColor) {
          badgeColors.set(pid, t.thread_accent_color ?? 'blue')
        } else if (currentColor !== 'amber' && currentColor !== t.thread_accent_color) {
          badgeColors.set(pid, 'amber')
        }
      }
    }

    // Единый BadgeDisplay по проекту через центральную функцию
    const badgeDisplays = new Map<string, BadgeDisplay>()
    for (const [pid, projectThreads] of threadsByProject) {
      badgeDisplays.set(pid, getAggregateBadgeDisplay(projectThreads))
    }

    // Badge для виртуальной записи «Без проекта» — той же функцией.
    const noProjectBadgeDisplay: BadgeDisplay = noProjectThreads.length > 0
      ? getAggregateBadgeDisplay(noProjectThreads)
      : { type: 'none' }
    const noProjectLastActivityAt = noProjectLastActivityMs > 0
      ? new Date(noProjectLastActivityMs).toISOString()
      : null

    return {
      totalUnread,
      unreadThreadsCount,
      unreadPersonalDialogsCount,
      noProjectBadgeDisplay,
      noProjectLastActivityAt,
      projectData: {
        badgeDisplays,
        clientUnreadCounts,
        internalUnreadCounts,
        threadIds,
        badgeColors,
      },
    }
  }, [threads])
}

/**
 * useTotalFilteredUnreadCount — общий счётчик непрочитанных с учётом доступа.
 * Тонкая обёртка над useSidebarInboxCounts для useFaviconBadge.
 */
export function useTotalFilteredUnreadCount(workspaceId: string) {
  const { totalUnread } = useSidebarInboxCounts(workspaceId)
  return { data: totalUnread }
}
