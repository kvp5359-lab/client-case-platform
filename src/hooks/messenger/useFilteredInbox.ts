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
import { useInboxThreadsV2 } from './useInbox'
import type { InboxThreadEntry } from '@/services/api/inboxService'

interface ThreadAccessInfo {
  id: string
  project_id: string | null
  access_type: string
  access_roles: string[]
  created_by: string | null
}

interface MyProjectRole {
  project_id: string
  participant_id: string
  project_roles: string[]
}

/**
 * Загружает данные о доступе для workspace-level фильтрации:
 * - Все project_threads с access_type/access_roles
 * - Мои роли во всех проектах
 * - Мои memberships в custom тредах
 * - Мои assignees в задачах
 */
function useWorkspaceAccessData(workspaceId: string) {
  const { user } = useAuth()

  // Все треды workspace с данными доступа
  const { data: threads = [] } = useQuery({
    queryKey: ['workspace-threads-access', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('id, project_id, access_type, access_roles, created_by')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
      if (error) throw error
      return (data ?? []) as ThreadAccessInfo[]
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  })

  // Мои роли во всех проектах workspace
  const { data: myProjectRoles = [] } = useQuery({
    queryKey: ['my-all-project-roles', workspaceId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select('project_id, participant_id, project_roles, participants!inner(user_id)')
        .eq('participants.user_id', user!.id)
      if (error) throw error
      return (data ?? []).map((pp) => ({
        project_id: pp.project_id as string,
        participant_id: pp.participant_id as string,
        project_roles: (pp.project_roles ?? []) as string[],
      })) as MyProjectRole[]
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: 60_000,
  })

  // Мои memberships в custom тредах
  const { data: myMemberThreadIds = new Set<string>() } = useQuery({
    queryKey: ['my-thread-memberships', workspaceId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_thread_members')
        .select('thread_id, participants!inner(user_id)')
        .eq('participants.user_id', user!.id)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.thread_id as string))
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: 60_000,
  })

  // Мои assignees в задачах
  const { data: myAssigneeThreadIds = new Set<string>() } = useQuery({
    queryKey: ['my-task-assignments', workspaceId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_assignees')
        .select('thread_id, participants!inner(user_id)')
        .eq('participants.user_id', user!.id)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.thread_id as string))
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: 60_000,
  })

  return { threads, myProjectRoles, myMemberThreadIds, myAssigneeThreadIds }
}

/**
 * useFilteredInbox — возвращает отфильтрованный по доступу список inbox тредов.
 * Единая замена для useInboxThreadsV2 во всех компонентах.
 */
export function useFilteredInbox(workspaceId: string) {
  const { user } = useAuth()
  const { data: rawInboxThreads = [], ...queryRest } = useInboxThreadsV2(workspaceId)
  const { threads, myProjectRoles, myMemberThreadIds, myAssigneeThreadIds } =
    useWorkspaceAccessData(workspaceId)

  // Быстрый lookup: project_id → мои роли
  const rolesByProject = useMemo(() => {
    const map = new Map<string, MyProjectRole>()
    for (const r of myProjectRoles) {
      map.set(r.project_id, r)
    }
    return map
  }, [myProjectRoles])

  // Быстрый lookup: thread_id → access info
  const threadAccessMap = useMemo(() => {
    const map = new Map<string, ThreadAccessInfo>()
    for (const t of threads) {
      map.set(t.id, t)
    }
    return map
  }, [threads])

  // Фильтрованные inbox треды
  const data = useMemo(() => {
    if (!user) return rawInboxThreads

    return rawInboxThreads.filter((entry) => {
      const access = threadAccessMap.get(entry.thread_id)
      if (!access) return true // Тред не найден в access данных — показываем (safety fallback)

      const myRole = access.project_id ? rolesByProject.get(access.project_id) : null

      // 1. Администратор видит всё
      if (myRole?.project_roles.includes('Администратор')) return true

      // 2. Создатель видит свой тред
      if (access.created_by === user.id) return true

      // 3. Исполнитель задачи
      if (myAssigneeThreadIds.has(entry.thread_id)) return true

      // 4. Проверка access_type
      if (access.access_type === 'all') return true

      if (access.access_type === 'roles' && myRole) {
        const accessRoles = access.access_roles ?? []
        if (myRole.project_roles.some((r) => accessRoles.includes(r))) return true
      }

      if (access.access_type === 'custom') {
        if (myMemberThreadIds.has(entry.thread_id)) return true
      }

      // Без проекта (workspace-level) — показываем
      if (!access.project_id) return true

      return false
    })
  }, [
    rawInboxThreads,
    user,
    threadAccessMap,
    rolesByProject,
    myMemberThreadIds,
    myAssigneeThreadIds,
  ])

  return { data, ...queryRest }
}

/**
 * useTotalFilteredUnreadCount — общий счётчик непрочитанных с учётом доступа.
 * Замена для useTotalUnreadCount.
 */
export function useTotalFilteredUnreadCount(workspaceId: string) {
  const { data: threads } = useFilteredInbox(workspaceId)

  const totalUnread = useMemo(() => {
    let count = 0
    for (const t of threads) {
      count += t.unread_count
      if (t.has_unread_reaction) count += 1
      if (t.manually_unread && t.unread_count === 0) count += 1
    }
    return count
  }, [threads])

  return { data: totalUnread }
}

/**
 * useProjectFilteredUnreadCounts — счётчики непрочитанных по проектам с учётом доступа.
 * Замена для useProjectUnreadCounts.
 */
export function useProjectFilteredUnreadCounts(workspaceId: string) {
  const { data: threads } = useFilteredInbox(workspaceId)

  return useMemo(() => {
    // Значение > 0 — реальные непрочитанные (показать число)
    // Значение -1 — manually_unread без сообщений (показать точку без числа)
    // Реакция = +1 к числу непрочитанных
    const unreadCounts = new Map<string, number>()
    const clientUnreadCounts = new Map<string, number>()
    const internalUnreadCounts = new Map<string, number>()
    const reactionEmojis = new Map<string, string>()
    const reactionOnlyProjects = new Set<string>()
    const threadIds = new Map<string, { client: string | null; internal: string | null }>()
    const badgeColors = new Map<string, string>()

    for (const t of threads) {
      if (!t.project_id) continue
      const pid = t.project_id
      const isClient = t.legacy_channel === 'client'
      const isInternal = t.legacy_channel === 'internal'
      const count = t.unread_count + (t.has_unread_reaction ? 1 : 0)
      const hasAny = count > 0 || t.manually_unread

      // Суммарные непрочитанные по проекту
      if (count > 0) {
        unreadCounts.set(pid, (unreadCounts.get(pid) ?? 0) + count)
      } else if (t.manually_unread && !unreadCounts.has(pid)) {
        unreadCounts.set(pid, -1)
      }

      // По каналам (client/internal) — для навигации при клике
      if (isClient) {
        if (count > 0) clientUnreadCounts.set(pid, (clientUnreadCounts.get(pid) ?? 0) + count)
        else if (t.manually_unread && !clientUnreadCounts.has(pid)) clientUnreadCounts.set(pid, -1)
      } else if (isInternal) {
        if (count > 0) internalUnreadCounts.set(pid, (internalUnreadCounts.get(pid) ?? 0) + count)
        else if (t.manually_unread && !internalUnreadCounts.has(pid))
          internalUnreadCounts.set(pid, -1)
      }

      // Реакции
      if (t.has_unread_reaction && t.last_reaction_emoji && isClient) {
        reactionEmojis.set(pid, t.last_reaction_emoji)
        if (t.unread_count === 0) {
          reactionOnlyProjects.add(pid)
        }
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

    return {
      data: {
        unreadCounts,
        clientUnreadCounts,
        internalUnreadCounts,
        reactionEmojis,
        reactionOnlyProjects,
        threadIds,
        badgeColors,
      },
    }
  }, [threads])
}
