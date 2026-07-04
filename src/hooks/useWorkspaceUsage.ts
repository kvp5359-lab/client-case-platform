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
  plan_code: string | null
  plan_name: string | null
  ai_tokens_used: number | null
  ai_tokens_monthly: number | null
}

export type Plan = {
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
  sort_order: number
}

const usageKey = (workspaceId: string) => ['workspace-usage', workspaceId] as const
const plansKey = ['plans'] as const

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

export type LimitMetric = {
  key: 'participants' | 'projects' | 'storage' | 'ai_tokens'
  label: string
  used: number
  max: number
  pct: number
  atLimit: boolean   // >= 100%
  nearLimit: boolean // >= 95%
}

/**
 * Производный статус лимитов воркспейса: что приближается к пределу (≥95%) или
 * достигнуто (100%). Пустой массив = тарифа/лимитов нет или всё в норме.
 */
export function useWorkspaceLimitStatus(workspaceId: string | undefined): {
  metrics: LimitMetric[]
  warnings: LimitMetric[]
  atLimit: (key: LimitMetric['key']) => boolean
} {
  const { data } = useWorkspaceUsageAndLimits(workspaceId)

  const build = (key: LimitMetric['key'], label: string, used: number, max: number | null): LimitMetric | null => {
    if (max == null) return null // нет лимита
    const pct = max > 0 ? Math.round((used / max) * 100) : 0
    return { key, label, used, max, pct, atLimit: used >= max, nearLimit: pct >= 95 }
  }

  const metrics: LimitMetric[] = data
    ? ([
        build('participants', 'участники команды', data.participants_count, data.max_participants),
        build('projects', 'проекты', data.projects_count, data.max_projects),
        build('storage', 'хранилище', data.storage_mb, data.max_storage_mb),
        build('ai_tokens', 'токены ИИ', data.ai_tokens_used ?? 0, data.ai_tokens_monthly),
      ].filter(Boolean) as LimitMetric[])
    : []

  return {
    metrics,
    warnings: metrics.filter((m) => m.nearLimit),
    atLimit: (key) => metrics.some((m) => m.key === key && m.atLimit),
  }
}

/** Витрина тарифов (все активные). */
export function usePlans() {
  return useQuery({
    queryKey: plansKey,
    staleTime: 300_000,
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from('plans' as never)
        .select('*')
        .order('sort_order' as never)
      if (error) throw error
      return (data as unknown as Plan[]) ?? []
    },
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
