"use client"

/**
 * Возвращает Set thread_id, у которых хотя бы одна из «клиентских» причин:
 *  - тред подключён к Telegram (project_telegram_chats.is_active)
 *  - тред подключён к Email (project_thread_email_links.is_active)
 *  - в проекте есть участник с проектной ролью «Клиент», у которого есть
 *    доступ к этому треду по правилам access_type/access_roles/custom.
 *
 * Используется в режиме «Вся история» проекта, чтобы у сообщений сотрудников
 * в клиентских тредах рисовались кольцо-аватара/левая полоса (как в обычном
 * режиме треда).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CLIENT_ROLES } from '@/components/messenger/chatSettingsTypes'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { STALE_TIME, projectClientThreadKeys } from '@/hooks/queryKeys'

interface ProjectClientRow {
  participant_id: string
  project_roles: string[] | null
}

export function useProjectClientThreadIds(
  projectId: string | undefined,
  threads: ProjectThread[],
): Set<string> {
  const threadIds = useMemo(() => threads.map((t) => t.id), [threads])
  const threadIdsKey = useMemo(() => [...threadIds].sort().join(','), [threadIds])

  const { data: clients = [] } = useQuery({
    queryKey: projectClientThreadKeys.clients(projectId ?? ''),
    queryFn: async (): Promise<ProjectClientRow[]> => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from('project_participants')
        .select('participant_id, project_roles')
        .eq('project_id', projectId)
      if (error) throw error
      return ((data ?? []) as ProjectClientRow[]).filter((p) =>
        (p.project_roles ?? []).some((r) => CLIENT_ROLES.includes(r)),
      )
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })

  const { data: telegramThreads = [] } = useQuery({
    queryKey: projectClientThreadKeys.telegram(projectId ?? ''),
    queryFn: async (): Promise<string[]> => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from('project_telegram_chats')
        .select('thread_id')
        .eq('project_id', projectId)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []).map((r) => r.thread_id as string).filter(Boolean)
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })

  const { data: emailThreads = [] } = useQuery({
    queryKey: projectClientThreadKeys.email(projectId ?? '', threadIdsKey),
    queryFn: async (): Promise<string[]> => {
      if (!projectId || threadIds.length === 0) return []
      const { data, error } = await supabase
        .from('project_thread_email_links')
        .select('thread_id')
        .in('thread_id', threadIds)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []).map((r) => r.thread_id as string).filter(Boolean)
    },
    enabled: !!projectId && threadIds.length > 0,
    staleTime: STALE_TIME.STANDARD,
  })

  const { data: customMembers = [] } = useQuery({
    queryKey: projectClientThreadKeys.custom(projectId ?? '', threadIdsKey),
    queryFn: async (): Promise<{ thread_id: string; participant_id: string }[]> => {
      if (!projectId || threadIds.length === 0) return []
      const { data, error } = await supabase
        .from('project_thread_members')
        .select('thread_id, participant_id')
        .in('thread_id', threadIds)
      if (error) throw error
      return (data ?? []) as { thread_id: string; participant_id: string }[]
    },
    enabled: !!projectId && threadIds.length > 0,
    staleTime: STALE_TIME.STANDARD,
  })

  return useMemo(() => {
    const result = new Set<string>()
    const telegramSet = new Set(telegramThreads)
    const emailSet = new Set(emailThreads)
    const clientParticipantIds = new Set(clients.map((c) => c.participant_id))
    const customByThread = new Map<string, Set<string>>()
    for (const row of customMembers) {
      let set = customByThread.get(row.thread_id)
      if (!set) {
        set = new Set<string>()
        customByThread.set(row.thread_id, set)
      }
      set.add(row.participant_id)
    }

    for (const t of threads) {
      if (telegramSet.has(t.id) || emailSet.has(t.id)) {
        result.add(t.id)
        continue
      }
      if (clients.length === 0) continue

      if (t.access_type === 'all') {
        result.add(t.id)
        continue
      }
      if (t.access_type === 'roles') {
        const accessRoles = t.access_roles ?? []
        if (accessRoles.length === 0) continue
        const intersect = clients.some((c) =>
          (c.project_roles ?? []).some((r) => accessRoles.includes(r)),
        )
        if (intersect) result.add(t.id)
        continue
      }
      if (t.access_type === 'custom') {
        const members = customByThread.get(t.id)
        if (!members) continue
        const hasClient = clients.some(
          (c) => clientParticipantIds.has(c.participant_id) && members.has(c.participant_id),
        )
        if (hasClient) result.add(t.id)
      }
    }
    return result
  }, [threads, clients, telegramThreads, emailThreads, customMembers])
}
