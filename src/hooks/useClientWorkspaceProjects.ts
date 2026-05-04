import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME } from '@/hooks/queryKeys'

export interface ClientProjectListItem {
  id: string
  name: string
}

/**
 * Список проектов воркспейса, доступных текущему клиенту.
 * Используется в клиентской шапке (селектор проектов) и для редиректа
 * с /workspaces/[id] на первый проект.
 */
export function useClientWorkspaceProjects(workspaceId: string | undefined) {
  const { user } = useAuth()

  return useQuery<ClientProjectListItem[]>({
    queryKey: ['client-workspace-projects', workspaceId ?? '', user?.id ?? ''],
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.LONG,
    queryFn: async () => {
      const { data: participant } = await supabase
        .from('participants')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user!.id)
        .eq('is_deleted', false)
        .maybeSingle()

      if (!participant) return []

      const { data: pp, error: ppErr } = await supabase
        .from('project_participants')
        .select('project_id')
        .eq('participant_id', participant.id)
      if (ppErr) throw ppErr

      const ids = (pp ?? []).map((r) => r.project_id)
      if (ids.length === 0) return []

      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .in('id', ids)
        .order('last_activity_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}
