"use client"

/**
 * Определяет, есть ли в треде участник проекта с проектной ролью «Клиент».
 *
 * Клиентский тред = тред, к которому имеет доступ хотя бы один клиент. По
 * этому флагу мессенджер подсвечивает сообщения от сотрудников (кольцо
 * аватара + левая полоса бабла), чтобы команда визуально отличалась от
 * клиента.
 *
 * Логика — одним запросом тянем участников проекта с ролью «Клиент» и их
 * членство в треде, дальше решаем по `access_type`:
 *  - 'all' → есть хотя бы один клиент в проекте → true
 *  - 'roles' → у клиента в `project_roles` пересекается с `access_roles`
 *  - 'custom' → клиент явно добавлен в `project_thread_members`
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CLIENT_ROLES } from '@/components/messenger/chatSettingsTypes'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { STALE_TIME } from '@/hooks/queryKeys'

interface ProjectClientRow {
  participant_id: string
  project_roles: string[] | null
}

export function useThreadHasClient(thread: ProjectThread | null | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['thread-has-client', thread?.id, thread?.access_type],
    queryFn: async () => {
      if (!thread || !thread.project_id) return false

      const { data: participants, error } = await supabase
        .from('project_participants')
        .select('participant_id, project_roles')
        .eq('project_id', thread.project_id)
      if (error) throw error

      const clients: ProjectClientRow[] = ((participants ?? []) as ProjectClientRow[]).filter((p) =>
        (p.project_roles ?? []).some((r) => CLIENT_ROLES.includes(r)),
      )
      if (clients.length === 0) return false

      if (thread.access_type === 'all') return true

      if (thread.access_type === 'roles') {
        const accessRoles = thread.access_roles ?? []
        if (accessRoles.length === 0) return false
        return clients.some((c) =>
          (c.project_roles ?? []).some((r) => accessRoles.includes(r)),
        )
      }

      // custom
      const { data: members, error: mErr } = await supabase
        .from('project_thread_members')
        .select('participant_id')
        .eq('thread_id', thread.id)
      if (mErr) throw mErr
      const memberIds = new Set((members ?? []).map((m) => m.participant_id as string))
      return clients.some((c) => memberIds.has(c.participant_id))
    },
    enabled: !!thread?.project_id,
    staleTime: STALE_TIME.STANDARD,
  })

  return !!data
}
