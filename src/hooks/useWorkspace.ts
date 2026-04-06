"use client"

/**
 * useWorkspace — React Query hook for fetching a single workspace by ID.
 * Replaces Zustand useWorkspaceStore for workspace data.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { workspaceKeys } from '@/hooks/queryKeys'
import type { Workspace } from '@/types/entities'

export function useWorkspace(workspaceId: string | undefined) {
  return useQuery<Workspace>({
    queryKey: workspaceKeys.detail(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId!)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Рабочее пространство не найдено или нет доступа')
      return data
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  })
}
