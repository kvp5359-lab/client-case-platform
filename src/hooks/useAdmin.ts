"use client"

/**
 * Платформенная админка (супер-админ). Все RPC защищены на сервере
 * (is_platform_admin) — фронт-гейт лишь для UX. Вызовы через строковый rpc
 * с приведением типа (в database.ts эти функции не сгенерированы).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type AdminWorkspace = {
  workspace_id: string
  workspace_name: string
  created_at: string
  plan_code: string | null
  plan_name: string | null
  billing_status: string | null
  participants_count: number
  projects_count: number
  storage_mb: number
  ai_tokens_used: number
  ai_tokens_monthly: number | null
}

export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ['is-platform-admin'],
    staleTime: 300_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('is_platform_admin' as never, {} as never)
      if (error) return false
      return data === true
    },
  })
}

export function useAdminWorkspaces(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-workspaces'],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminWorkspace[]> => {
      const { data, error } = await supabase.rpc('admin_list_workspaces' as never, {} as never)
      if (error) throw error
      return (data as unknown as AdminWorkspace[]) ?? []
    },
  })
}

export function useSetWorkspacePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ workspaceId, planCode }: { workspaceId: string; planCode: string | null }) => {
      const { error } = await supabase.rpc(
        'admin_set_workspace_plan' as never,
        { p_workspace_id: workspaceId, p_plan_code: planCode } as never,
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-workspaces'] }),
  })
}
