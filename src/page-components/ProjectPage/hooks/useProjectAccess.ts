"use client"

/**
 * Хук для проверки доступа к проекту
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { projectAccessKeys, STALE_TIME } from '@/hooks/queryKeys'

export function useProjectAccess(projectId: string | undefined, workspaceId: string | undefined) {
  const { user } = useAuth()
  const { isOwner: isWorkspaceOwner, canViewAllProjects } = useWorkspacePermissions({
    workspaceId: workspaceId || '',
  })

  const { data: hasAccess, isLoading } = useQuery({
    queryKey: projectAccessKeys.check(projectId, user?.id, isWorkspaceOwner, canViewAllProjects),
    queryFn: async () => {
      if (!projectId || !user?.id || !workspaceId) return false

      // Владелец или с правом view_all_projects — имеет доступ
      if (isWorkspaceOwner || canViewAllProjects) {
        return true
      }

      // Проверяем, является ли пользователь участником проекта (один JOIN-запрос вместо двух)
      const { data: projectParticipant } = await supabase
        .from('project_participants')
        .select('id, participant:participants!inner(id)')
        .eq('project_id', projectId)
        .eq('participants.workspace_id', workspaceId)
        .eq('participants.user_id', user.id)
        .eq('participants.is_deleted', false)
        .maybeSingle()

      return !!projectParticipant
    },
    enabled: !!projectId && !!user?.id && !!workspaceId,
    staleTime: STALE_TIME.LONG,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

  return {
    hasAccess,
    isLoading,
  }
}
