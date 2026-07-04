"use client"

/**
 * Потребление воркспейса vs лимиты + экспорт данных (аудит корзина C / B1).
 * RPC добавлены миграцией 20260704150000, в database.ts ещё не сгенерированы —
 * поэтому вызовы через строковый rpc с приведением типа результата.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type WorkspaceUsage = {
  participants_count: number
  projects_count: number
  storage_mb: number
  max_participants: number | null
  max_projects: number | null
  max_storage_mb: number | null
}

const usageKey = (workspaceId: string) => ['workspace-usage', workspaceId] as const

export function useWorkspaceUsageAndLimits(workspaceId: string | undefined) {
  return useQuery({
    queryKey: usageKey(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceUsage | null> => {
      const { data, error } = await supabase.rpc(
        'get_workspace_usage_and_limits' as never,
        { p_workspace_id: workspaceId } as never,
      )
      if (error) throw error
      const rows = data as unknown as WorkspaceUsage[]
      return rows?.[0] ?? null
    },
  })
}

export function useUpdateWorkspaceLimits(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (limits: {
      max_participants: number | null
      max_projects: number | null
      max_storage_mb: number | null
    }) => {
      const { error } = await supabase
        .from('workspace_limits' as never)
        .upsert(
          { workspace_id: workspaceId, ...limits, updated_at: new Date().toISOString() } as never,
          { onConflict: 'workspace_id' } as never,
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: usageKey(workspaceId) }),
  })
}

/** Выгрузка структурных данных воркспейса в JSON (только владелец). */
export function useExportWorkspace(workspaceId: string) {
  return useMutation({
    mutationFn: async (): Promise<unknown> => {
      const { data, error } = await supabase.rpc(
        'export_workspace_data' as never,
        { p_workspace_id: workspaceId } as never,
      )
      if (error) throw error
      return data
    },
  })
}
