"use client"

/**
 * useWorkspaceTasks — загрузка всех задач workspace через RPC get_workspace_tasks.
 * Используется на странице «Все задачи».
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { taskKeys } from '@/hooks/queryKeys'

export interface WorkspaceTask {
  id: string
  name: string
  type?: 'chat' | 'task'
  project_id: string | null
  project_name: string | null
  workspace_id: string
  status_id: string | null
  status_name: string | null
  status_color: string | null
  status_order: number | null
  status_show_to_creator: boolean
  deadline: string | null
  accent_color: string
  icon: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  sort_order: number
}

export function useWorkspaceTasks(workspaceId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.workspace(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_workspace_threads' as never, {
        p_workspace_id: workspaceId!,
      } as never)
      if (error) throw error
      return (data ?? []) as WorkspaceTask[]
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}
