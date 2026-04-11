"use client"

/**
 * useWorkspaceThreads — загрузка тредов workspace (задачи + чаты).
 * Возвращает только треды, к которым у текущего пользователя есть доступ.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceThreadKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { WorkspaceTask } from './useWorkspaceTasks'

export function useWorkspaceThreads(workspaceId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: workspaceThreadKeys.forUser(workspaceId ?? '', user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_workspace_threads' as never, {
        p_workspace_id: workspaceId!,
        p_user_id: user!.id,
      } as never)
      if (error) throw error
      return (data ?? []) as WorkspaceTask[]
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.SHORT,
  })
}
