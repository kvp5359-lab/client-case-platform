"use client"

/**
 * useWorkspaceThreads — загрузка ВСЕХ тредов workspace (задачи + чаты).
 * Используется на досках, где нужны не только задачи.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { WorkspaceTask } from './useWorkspaceTasks'

export function useWorkspaceThreads(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-threads', workspaceId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as Function)('get_workspace_threads', {
        p_workspace_id: workspaceId!,
      })
      if (error) throw error
      return (data ?? []) as WorkspaceTask[]
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}
