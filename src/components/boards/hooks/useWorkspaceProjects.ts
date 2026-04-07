"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type BoardProject = Tables<'projects'> & {
  template_name: string | null
}

export function useWorkspaceProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['boards', 'projects', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, project_templates(name)')
        .eq('workspace_id', workspaceId!)
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
    staleTime: 2 * 60 * 1000,
  })
}
