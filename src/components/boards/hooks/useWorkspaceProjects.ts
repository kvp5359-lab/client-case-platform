"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

export type BoardProject = Tables<'projects'> & {
  template_name: string | null
}

export function useWorkspaceProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: boardKeys.projectsByWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, project_templates(name)')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      return (data ?? []).map((p) => ({
        ...p,
        template_name: (p.project_templates as { name: string } | null)?.name ?? null,
        project_templates: undefined,
      })) as BoardProject[]
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
  })
}
