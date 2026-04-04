"use client"

/**
 * Лёгкий хук для загрузки участников проекта, сгруппированных по ролям (для хедера).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

export interface RoleGroup {
  role: string
  participants: AvatarParticipant[]
}

export function useProjectHeaderParticipants(
  projectId: string | undefined,
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey: ['project-header-participants', projectId],
    queryFn: async (): Promise<RoleGroup[]> => {
      if (!projectId || !workspaceId) return []

      const [{ data: ppData, error: ppError }, { data: rolesData, error: rolesError }] =
        await Promise.all([
          supabase
            .from('project_participants')
            .select('project_roles, participant:participants(id, name, last_name, avatar_url)')
            .eq('project_id', projectId),
          supabase
            .from('project_roles')
            .select('name, order_index')
            .eq('workspace_id', workspaceId)
            .order('order_index'),
        ])

      if (ppError) throw ppError
      if (rolesError) throw rolesError

      const roleOrder = (rolesData || []).map((r) => r.name)

      // Собираем участников по ролям
      const grouped = new Map<string, AvatarParticipant[]>()
      for (const row of ppData || []) {
        const pp = row as { project_roles: string[]; participant: AvatarParticipant }
        if (!pp.participant) continue
        for (const role of pp.project_roles) {
          if (!grouped.has(role)) grouped.set(role, [])
          grouped.get(role)!.push(pp.participant)
        }
      }

      // Возвращаем в порядке ролей, пропуская пустые
      return roleOrder
        .filter((role) => grouped.has(role))
        .map((role) => ({ role, participants: grouped.get(role)! }))
    },
    enabled: !!projectId && !!workspaceId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
