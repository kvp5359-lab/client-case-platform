"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import type { Board } from '../types'

export function useBoardsQuery(workspaceId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: boardKeys.byWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_workspace_boards', {
        p_workspace_id: workspaceId!,
        p_user_id: user!.id,
      })
      if (error) throw error
      return (data ?? []) as Board[]
    },
    enabled: !!workspaceId && !!user,
    staleTime: STALE_TIME.SHORT,
  })
}
