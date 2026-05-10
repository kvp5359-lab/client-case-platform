"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { financeTxCategoryKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STALE_TIME = 5 * 60_000

export type FinanceTxCategory = Tables<'finance_transaction_categories'>
export type FinanceTxCategoryKind = 'income' | 'expense'

export interface FinanceTxCategoryFormData {
  name: string
}

/** Список активных категорий воркспейса по виду (доходы или расходы). */
export function useFinanceTxCategories(
  workspaceId: string | undefined,
  kind: FinanceTxCategoryKind,
) {
  return useQuery({
    queryKey: workspaceId
      ? financeTxCategoryKeys.list(workspaceId, kind)
      : ['finance-tx-categories', 'list', 'none', kind],
    enabled: !!workspaceId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<FinanceTxCategory[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('finance_transaction_categories')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('kind', kind)
        .eq('is_deleted', false)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as FinanceTxCategory[]
    },
  })
}

export function useCreateFinanceTxCategory(
  workspaceId: string | undefined,
  kind: FinanceTxCategoryKind,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: FinanceTxCategoryFormData): Promise<FinanceTxCategory> => {
      if (!workspaceId) throw new Error('workspaceId required')
      const { data, error } = await supabase
        .from('finance_transaction_categories')
        .insert({ workspace_id: workspaceId, kind, name: form.name.trim() })
        .select('*')
        .single()
      if (error) throw error
      return data as FinanceTxCategory
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeTxCategoryKeys.list(workspaceId, kind) })
    },
  })
}

export function useUpdateFinanceTxCategory(
  workspaceId: string | undefined,
  kind: FinanceTxCategoryKind,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      form: FinanceTxCategoryFormData
    }): Promise<FinanceTxCategory> => {
      const { data, error } = await supabase
        .from('finance_transaction_categories')
        .update({ name: params.form.name.trim() })
        .eq('id', params.id)
        .select('*')
        .single()
      if (error) throw error
      return data as FinanceTxCategory
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeTxCategoryKeys.list(workspaceId, kind) })
    },
  })
}

export function useDeleteFinanceTxCategory(
  workspaceId: string | undefined,
  kind: FinanceTxCategoryKind,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('finance_transaction_categories')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeTxCategoryKeys.list(workspaceId, kind) })
    },
  })
}
