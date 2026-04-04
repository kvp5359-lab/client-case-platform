"use client"

/**
 * useAccessibleThreadIds — единая логика определения доступа к тредам (чаты + задачи).
 *
 * Пользователь видит тред если:
 * 1. Он Администратор проекта → видит ВСЁ
 * 2. Он исполнитель задачи (task_assignees)
 * 3. Он указан в "Кто видит" — через роли (access_roles) или напрямую (project_thread_members)
 * 4. Он создатель треда (created_by)
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectThreads, type ProjectThread } from './useProjectThreads'
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

function canAccessThread(
  thread: ProjectThread,
  myData: MyProjectData | null,
  userId: string | undefined,
  threadMembersMap: Record<string, { id: string }[]>,
  taskAssigneesMap: Record<string, { id: string }[]>,
): boolean {
  if (!myData || !userId) return false

  // 1. Администратор видит всё
  if (myData.projectRoles.includes('Администратор')) return true

  // 2. Создатель всегда видит свой тред
  if (thread.created_by === userId) return true

  // 3. Исполнитель задачи (task_assignees)
  const assignees = taskAssigneesMap[thread.id] ?? []
  if (assignees.some((a) => a.id === myData.participantId)) return true

  // 4. "Кто видит" — по access_type
  if (thread.access_type === 'all') return true

  if (thread.access_type === 'roles') {
    const accessRoles = thread.access_roles ?? []
    if (myData.projectRoles.some((r) => accessRoles.includes(r))) return true
  }

  if (thread.access_type === 'custom') {
    const members = threadMembersMap[thread.id] ?? []
    if (members.some((m) => m.id === myData.participantId)) return true
  }

  return false
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
      if (canAccessThread(t, myData, user?.id, threadMembersMap, taskAssigneesMap)) {
        ids.add(t.id)
      }
    }
    return ids
  }, [allThreads, myData, user?.id, threadMembersMap, taskAssigneesMap])

  const accessibleChats = useMemo(
    () => allThreads.filter((t) => !t.is_deleted && accessibleThreadIds.has(t.id)),
    [allThreads, accessibleThreadIds],
  )

  return { accessibleThreadIds, accessibleChats, allThreads, threadsLoading, myData }
}
