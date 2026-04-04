"use client"

/**
 * Общий хук для получения участников workspace.
 * Заменяет 3 дублирующихся копии в ChatSettingsDialog, ThreadTemplateDialog, AssigneesPopover.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface WorkspaceParticipant {
  id: string
  name: string
  last_name: string | null
  email: string | null
  avatar_url: string | null
  user_id: string | null
  workspace_roles: string[] | null
  can_login: boolean
}

/**
 * Загружает всех активных (не удалённых) участников workspace.
 * queryKey: ['workspace-participants', workspaceId]
 */
export function useWorkspaceParticipants(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-participants', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, name, last_name, email, avatar_url, user_id, workspace_roles, can_login')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
      if (error) throw error
      return (data ?? []) as WorkspaceParticipant[]
    },
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}
