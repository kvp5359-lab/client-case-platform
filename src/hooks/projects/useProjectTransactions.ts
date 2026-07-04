"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { projectTransactionKeys, workspaceTransactionKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STALE_TIME = 5 * 60_000

export type ProjectTransaction = Tables<'project_transactions'>
export type TransactionType = 'income' | 'expense'

export type ProjectTransactionFormData = {
  type: TransactionType
  /** ISO-дата (YYYY-MM-DD). */
  date: string
  /** Контрагент (от кого / кому) — необязательно. */
  participant_id: string | null
  /** Статья — id из finance_transaction_categories соответствующего kind, опционально. */
  category_id: string | null
  amount: number
  comment: string | null
  /** UUID ставки налога из справочника finance_tax_rates (или null). */
  tax_rate_id: string | null
  /** Snapshot процента налога (накручен в amount; «чистая» сумма
   *  = amount × 100 / (100 + tax_rate)). */
  tax_rate: number | null
}

/** Список транзакций проекта по типу, отсортирован по date DESC. */
export function useProjectTransactions(
  projectId: string | undefined,
  type: TransactionType,
) {
  return useQuery({
    queryKey: projectId
      ? projectTransactionKeys.list(projectId, type)
      : ['project-transactions', 'list', 'none', type],
    enabled: !!projectId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<ProjectTransaction[]> => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from('project_transactions')
        .select('*')
        .eq('project_id', projectId)
        .eq('type', type)
        .eq('is_deleted', false)
        // Хронологический порядок: старые даты сверху, новые ниже;
        // при одинаковой дате — в порядке добавления (FIFO).
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectTransaction[]
    },
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, projectId?: string) {
  if (!projectId) return
  // Инвалидируем оба типа списков сразу — вдруг тип сменился при редактировании.
  queryClient.invalidateQueries({ queryKey: projectTransactionKeys.list(projectId, 'income') })
  queryClient.invalidateQueries({ queryKey: projectTransactionKeys.list(projectId, 'expense') })
  // Общий журнал воркспейса (страница «Финансы») — broad-prefix, workspaceId
  // в этом хуке недоступен.
  queryClient.invalidateQueries({ queryKey: workspaceTransactionKeys.all })
}

export function useCreateProjectTransaction(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: ProjectTransactionFormData): Promise<ProjectTransaction> => {
      if (!projectId) throw new Error('projectId required')
      const { data, error } = await supabase
        .from('project_transactions')
        .insert({
          project_id: projectId,
          type: form.type,
          date: form.date,
          participant_id: form.participant_id,
          category_id: form.category_id,
          amount: form.amount,
          comment: form.comment?.trim() || null,
          tax_rate_id: form.tax_rate_id,
          tax_rate: form.tax_rate,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as ProjectTransaction
    },
    onSuccess: () => invalidate(queryClient, projectId),
  })
}

export function useUpdateProjectTransaction(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      form: ProjectTransactionFormData
    }): Promise<ProjectTransaction> => {
      const { data, error } = await supabase
        .from('project_transactions')
        .update({
          type: params.form.type,
          date: params.form.date,
          participant_id: params.form.participant_id,
          category_id: params.form.category_id,
          amount: params.form.amount,
          comment: params.form.comment?.trim() || null,
          tax_rate_id: params.form.tax_rate_id,
          tax_rate: params.form.tax_rate,
        })
        .eq('id', params.id)
        .select('*')
        .single()
      if (error) throw error
      return data as ProjectTransaction
    },
    onSuccess: () => invalidate(queryClient, projectId),
  })
}

/**
 * Частичное обновление одной транзакции — для inline-редактирования
 * прямо в таблице доходов/расходов.
 */
export type ProjectTransactionPatch = Partial<{
  type: TransactionType
  date: string
  participant_id: string | null
  category_id: string | null
  amount: number
  comment: string | null
  tax_rate_id: string | null
  tax_rate: number | null
}>

export function usePatchProjectTransaction(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      patch: ProjectTransactionPatch
    }): Promise<void> => {
      const { error } = await supabase
        .from('project_transactions')
        .update(params.patch)
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => invalidate(queryClient, projectId),
  })
}

export function useDeleteProjectTransaction(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('project_transactions')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(queryClient, projectId),
  })
}
