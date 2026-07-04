"use client"

/**
 * Валюты воркспейса и проекта (см. src/lib/currency.ts — модель).
 *
 * - useWorkspaceCurrency    — базовая + включённые валюты воркспейса;
 * - useUpdateWorkspaceCurrency — сохранение настроек (Настройки → Общие);
 * - useProjectCurrency      — валюта проекта (fallback на базовую);
 * - useUpdateProjectCurrency — смена валюты проекта (чип на вкладке Финансы).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { workspaceKeys } from '@/hooks/queryKeys'
import { DEFAULT_CURRENCY } from '@/lib/currency'

const STALE_TIME = 5 * 60_000

export const projectCurrencyKeys = {
  byProject: (projectId: string) => ['project-currency', projectId] as const,
}

export function useWorkspaceCurrency(workspaceId: string | undefined) {
  const { data: workspace, isLoading } = useWorkspace(workspaceId)
  const baseCurrency = workspace?.base_currency ?? DEFAULT_CURRENCY
  const enabled = workspace?.enabled_currencies ?? []
  return {
    baseCurrency,
    // Базовая всегда в списке включённых, даже если её забыли отметить.
    enabledCurrencies: enabled.includes(baseCurrency) ? enabled : [baseCurrency, ...enabled],
    isLoading,
  }
}

export function useUpdateWorkspaceCurrency(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      baseCurrency: string
      enabledCurrencies: string[]
    }): Promise<void> => {
      if (!workspaceId) throw new Error('workspaceId required')
      const { error } = await supabase
        .from('workspaces')
        .update({
          base_currency: params.baseCurrency,
          enabled_currencies: params.enabledCurrencies,
        })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
    },
  })
}

/** Валюта проекта: projects.currency ?? базовая воркспейса. */
export function useProjectCurrency(
  workspaceId: string | undefined,
  projectId: string | undefined,
) {
  const { baseCurrency, enabledCurrencies, isLoading: wsLoading } =
    useWorkspaceCurrency(workspaceId)
  const { data, isLoading } = useQuery({
    queryKey: projectCurrencyKeys.byProject(projectId ?? ''),
    enabled: !!projectId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('projects')
        .select('currency')
        .eq('id', projectId!)
        .maybeSingle()
      if (error) throw error
      return data?.currency ?? null
    },
  })
  return {
    currency: data ?? baseCurrency,
    /** Явно ли валюта задана у проекта (или унаследована от воркспейса). */
    isExplicit: data != null,
    baseCurrency,
    enabledCurrencies,
    isLoading: wsLoading || isLoading,
  }
}

export function useUpdateProjectCurrency(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (currency: string | null): Promise<void> => {
      if (!projectId) throw new Error('projectId required')
      const { error } = await supabase
        .from('projects')
        .update({ currency })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      if (!projectId) return
      queryClient.invalidateQueries({ queryKey: projectCurrencyKeys.byProject(projectId) })
    },
  })
}
