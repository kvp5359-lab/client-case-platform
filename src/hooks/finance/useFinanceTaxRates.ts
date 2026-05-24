"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { financeTaxRateKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STALE_TIME = 5 * 60_000

export type FinanceTaxRate = Tables<'finance_tax_rates'>

export type FinanceTaxRateFormData = {
  name: string
  /** Процент 0..100, например 21 для НДС 21%. */
  rate: number
  is_default: boolean
}

/** Список активных ставок налога воркспейса, сортировка: дефолтная первой, потом по rate. */
export function useFinanceTaxRates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId
      ? financeTaxRateKeys.list(workspaceId)
      : ['finance-tax-rates', 'list', 'none'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<FinanceTaxRate[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('finance_tax_rates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('is_default', { ascending: false })
        .order('rate', { ascending: true })
      if (error) throw error
      return (data ?? []) as FinanceTaxRate[]
    },
  })
}

/**
 * Если хочется поставить is_default=true новой/обновлённой записи —
 * сначала снимаем флаг с предыдущей дефолтной (на воркспейс должна быть
 * только одна; в БД на это есть partial unique index).
 */
async function clearDefaultFor(workspaceId: string, exceptId?: string): Promise<void> {
  const query = supabase
    .from('finance_tax_rates')
    .update({ is_default: false })
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
  const { error } = exceptId ? await query.neq('id', exceptId) : await query
  if (error) throw error
}

export function useCreateFinanceTaxRate(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: FinanceTaxRateFormData): Promise<FinanceTaxRate> => {
      if (!workspaceId) throw new Error('workspaceId required')
      if (form.is_default) await clearDefaultFor(workspaceId)
      const { data, error } = await supabase
        .from('finance_tax_rates')
        .insert({
          workspace_id: workspaceId,
          name: form.name.trim(),
          rate: form.rate,
          is_default: form.is_default,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as FinanceTaxRate
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeTaxRateKeys.list(workspaceId) })
    },
  })
}

export function useUpdateFinanceTaxRate(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      form: FinanceTaxRateFormData
    }): Promise<FinanceTaxRate> => {
      if (!workspaceId) throw new Error('workspaceId required')
      if (params.form.is_default) await clearDefaultFor(workspaceId, params.id)
      const { data, error } = await supabase
        .from('finance_tax_rates')
        .update({
          name: params.form.name.trim(),
          rate: params.form.rate,
          is_default: params.form.is_default,
        })
        .eq('id', params.id)
        .select('*')
        .single()
      if (error) throw error
      return data as FinanceTaxRate
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeTaxRateKeys.list(workspaceId) })
    },
  })
}

export function useDeleteFinanceTaxRate(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('finance_tax_rates')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          // Снимаем default — partial unique index требует уникальности среди живых,
          // но и в удалённой записи флаг лучше сбросить, чтобы не мешать.
          is_default: false,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeTaxRateKeys.list(workspaceId) })
    },
  })
}
