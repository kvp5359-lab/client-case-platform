"use client"

/**
 * useAccessibleThreadIds — единая логика определения доступа к тредам (чаты + задачи).
 *
 * Использует canAccessThread из utils/threadAccess.ts — единый источник правды.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { canAccessThread } from '@/utils/threadAccess'
import { useProjectThreads } from './useProjectThreads'
import { useThreadMembersMap } from '@/components/tasks/useThreadMembersMap'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'

interface MyProjectData {
  participantId: string
  projectRoles: string[]
}

function useMyProjectData(projectId: string | undefined): MyProjectData | null {
  const { user } = useAuth()

  const { data } = useQuery({
    queryKey: ['my-project-participant', projectId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select('participant_id, project_roles, participants!inner(user_id)')
        .eq('project_id', projectId!)
        .eq('participants.user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
        ? {
            participantId: data.participant_id as string,
            projectRoles: (data.project_roles ?? []) as string[],
          }
        : null
    },
    enabled: !!projectId && !!user?.id,
    staleTime: 60_000,
  })

  return data ?? null
}

export function useAccessibleThreadIds(projectId: string | undefined) {
  const { user } = useAuth()
  const myData = useMyProjectData(projectId)
  const { data: allThreads = [], isLoading: threadsLoading } = useProjectThreads(projectId)

  // Load members for custom threads
  const customThreadIds = useMemo(
    () => allThreads.filter((t) => t.access_type === 'custom').map((t) => t.id),
    [allThreads],
  )
  const { data: threadMembersMap = {} } = useThreadMembersMap(customThreadIds)

  // Load assignees for task threads
  const taskThreadIds = useMemo(
    () => allThreads.filter((t) => t.type === 'task').map((t) => t.id),
    [allThreads],
  )
  const { data: taskAssigneesMap = {} } = useTaskAssigneesMap(taskThreadIds)

  // Filter accessible threads
  const accessibleThreadIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of allThreads) {
      if (t.is_deleted) continue

      const assignees = taskAssigneesMap[t.id] ?? []
      const members = threadMembersMap[t.id] ?? []

      const hasAccess = canAccessThread({
        thread: {
          id: t.id,
          project_id: t.project_id,
          access_type: t.access_type,
          access_roles: t.access_roles,
          created_by: t.created_by,
        },
        userId: user?.id ?? '',
        participantId: myData?.participantId ?? null,
        projectRoles: myData?.projectRoles ?? null,
        isAssignee: assignees.some((a) => a.id === myData?.participantId),
        isMember: members.some((m) => m.id === myData?.participantId),
        hasViewAllProjects: false, // В контексте проекта view_all не проверяем — это workspace-level
      })

      if (hasAccess) ids.add(t.id)
    }
    return ids
  }, [allThreads, myData, user?.id, threadMembersMap, taskAssigneesMap])

  const accessibleChats = useMemo(
    () => allThreads.filter((t) => !t.is_deleted && accessibleThreadIds.has(t.id)),
    [allThreads, accessibleThreadIds],
  )

  return { accessibleThreadIds, accessibleChats, allThreads, threadsLoading, myData }
}
