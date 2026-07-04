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
  plans: ['admin-plans'] as const,
  payments: ['admin-payments'] as const,
  config: ['admin-platform-config'] as const,
  invites: ['admin-invites'] as const,
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

// ── Этап 2: биллинг + регистрация ─────────────────────────────────────────

export type AdminPlan = {
  id: string
  code: string
  name: string
  description: string | null
  price_monthly: number
  currency: string
  max_participants: number | null
  max_projects: number | null
  max_tasks: number | null
  max_storage_mb: number | null
  ai_tokens_monthly: number | null
  enabled_modules: string[]
  is_active: boolean
  sort_order: number
}

export type AdminPayment = {
  id: string
  workspace_id: string
  workspace_name: string | null
  amount: number
  currency: string
  paid_at: string
  period_months: number
  comment: string | null
  created_at: string
}

export type PlatformConfig = {
  registration_open: boolean
  default_trial_days: number
  default_trial_plan_code: string | null
}

export type AdminInvite = {
  id: string
  code: string
  note: string | null
  max_uses: number
  used_count: number
  expires_at: string | null
  created_at: string
}

export function useAdminPlans(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.plans,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AdminPlan[]> => {
      const { data, error } = await supabase.rpc('admin_list_plans' as never, {} as never)
      if (error) throw error
      return (data as unknown as AdminPlan[]) ?? []
    },
  })
}

export function useUpsertPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plan: Partial<AdminPlan>) => {
      const { error } = await supabase.rpc('admin_upsert_plan' as never, { p: plan } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.plans })
      qc.invalidateQueries({ queryKey: ['plans'] })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useAdminPayments(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.payments,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminPayment[]> => {
      const { data, error } = await supabase.rpc(
        'admin_list_payments' as never,
        { p_workspace_id: null, p_limit: 300 } as never,
      )
      if (error) throw error
      return (data as unknown as AdminPayment[]) ?? []
    },
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      workspaceId: string
      amount: number
      currency: string
      paidAt: string
      periodMonths: number
      comment: string | null
    }) => {
      const { error } = await supabase.rpc('admin_record_payment' as never, {
        p_workspace_id: input.workspaceId,
        p_amount: input.amount,
        p_currency: input.currency,
        p_paid_at: input.paidAt,
        p_period_months: input.periodMonths,
        p_comment: input.comment,
      } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.payments })
      qc.invalidateQueries({ queryKey: adminKeys.workspaces })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useDeletePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.rpc('admin_delete_payment' as never, { p_payment_id: paymentId } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.payments })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useSetBillingDates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      workspaceId: string
      status: string | null
      trialEndsAt: string | null
      paidUntil: string | null
    }) => {
      const { error } = await supabase.rpc('admin_set_billing_dates' as never, {
        p_workspace_id: input.workspaceId,
        p_status: input.status,
        p_trial_ends_at: input.trialEndsAt,
        p_paid_until: input.paidUntil,
      } as never)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: adminKeys.workspaces })
      qc.invalidateQueries({ queryKey: adminKeys.workspaceDetails(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function usePlatformConfig(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.config,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<PlatformConfig | null> => {
      const { data, error } = await supabase.rpc('admin_get_platform_config' as never, {} as never)
      if (error) throw error
      return (data as unknown as PlatformConfig) ?? null
    },
  })
}

export function useSetPlatformConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cfg: PlatformConfig) => {
      const { error } = await supabase.rpc('admin_set_platform_config' as never, {
        p_registration_open: cfg.registration_open,
        p_default_trial_days: cfg.default_trial_days,
        p_default_trial_plan_code: cfg.default_trial_plan_code,
      } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.config })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useAdminInvites(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.invites,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminInvite[]> => {
      const { data, error } = await supabase.rpc('admin_list_invites' as never, {} as never)
      if (error) throw error
      return (data as unknown as AdminInvite[]) ?? []
    },
  })
}

export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { note: string | null; maxUses: number; expiresDays: number | null }) => {
      const { data, error } = await supabase.rpc('admin_create_invite' as never, {
        p_note: input.note,
        p_max_uses: input.maxUses,
        p_expires_days: input.expiresDays,
      } as never)
      if (error) throw error
      return data as unknown as { id: string; code: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.invites })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}

export function useDeleteInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_delete_invite' as never, { p_id: id } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.invites })
      qc.invalidateQueries({ queryKey: adminKeys.audit })
    },
  })
}
