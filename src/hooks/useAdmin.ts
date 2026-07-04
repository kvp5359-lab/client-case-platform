"use client"

/**
 * Платформенная админка (супер-админ). Все RPC защищены на сервере
 * (require_platform_admin) — фронт-гейт лишь для UX. Вызовы через строковый rpc
 * с приведением типа (в database.ts эти функции не сгенерированы).
 * План: docs/feature-backlog/2026-07-04-platform-admin-console.md
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const adminKeys = {
  isAdmin: ['is-platform-admin'] as const,
  workspaces: ['admin-workspaces'] as const,
  workspaceDetails: (id: string) => ['admin-workspace-details', id] as const,
  audit: ['admin-audit'] as const,
}

export type AdminWorkspace = {
  workspace_id: string
  workspace_name: string
  created_at: string
  is_suspended: boolean
  is_deleted: boolean
  owner_name: string | null
  owner_email: string | null
  plan_code: string | null
  plan_name: string | null
  billing_status: string | null
  trial_ends_at: string | null
  paid_until: string | null
  participants_count: number
  projects_count: number
  storage_mb: number
  ai_tokens_used: number
  ai_tokens_monthly: number | null
  last_activity_at: string | null
}

export type AdminWorkspaceDetails = {
  workspace: {
    id: string
    name: string
    slug: string | null
    created_at: string
    is_suspended: boolean
    suspended_at: string | null
    is_deleted: boolean
  } | null
  owner: { name: string; email: string | null; phone: string | null; user_id: string | null } | null
  billing: {
    plan_code: string | null
    plan_name: string | null
    status: string | null
    trial_ends_at: string | null
    paid_until: string | null
  } | null
  usage: {
    participants: number
    projects: number
    threads: number
    storage_mb: number
    messages_30d: number
    ai_tokens_month: number
    last_activity_at: string | null
  }
  integrations: {
    telegram_bots: number
    wazzup_channels: number
    email_accounts: number
    email_watch_expired: number
    mtproto_sessions: number
    business_connections: number
  }
  participants: Array<{
    name: string
    email: string | null
    roles: string[] | null
    can_login: boolean
    has_account: boolean
    created_at: string
  }>
  ai_monthly: Array<{ period: string; total_tokens: number }>
}

export type AdminAuditEntry = {
  id: number
  created_at: string
  admin_email: string | null
  action: string
  workspace_id: string | null
  workspace_name: string | null
  target_user_id: string | null
  details: Record<string, unknown> | null
}

export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: adminKeys.isAdmin,
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
    queryKey: adminKeys.workspaces,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminWorkspace[]> => {
      const { data, error } = await supabase.rpc('admin_list_workspaces' as never, {} as never)
      if (error) throw error
      return (data as unknown as AdminWorkspace[]) ?? []
    },
  })
}

export function useAdminWorkspaceDetails(workspaceId: string | null) {
  return useQuery({
    queryKey: adminKeys.workspaceDetails(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminWorkspaceDetails | null> => {
      const { data, error } = await supabase.rpc(
        'admin_workspace_details' as never,
        { p_workspace_id: workspaceId } as never,
      )
      if (error) throw error
      return (data as unknown as AdminWorkspaceDetails) ?? null
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
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.workspaces })
      qc.invalidateQueries({ queryKey: adminKeys.workspaceDetails(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useSuspendWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ workspaceId, suspended }: { workspaceId: string; suspended: boolean }) => {
      const { error } = await supabase.rpc(
        'admin_suspend_workspace' as never,
        { p_workspace_id: workspaceId, p_suspended: suspended } as never,
      )
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.workspaces })
      qc.invalidateQueries({ queryKey: adminKeys.workspaceDetails(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useAdminAudit(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.audit,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminAuditEntry[]> => {
      const { data, error } = await supabase.rpc('admin_list_audit' as never, { p_limit: 300 } as never)
      if (error) throw error
      return (data as unknown as AdminAuditEntry[]) ?? []
    },
  })
}
