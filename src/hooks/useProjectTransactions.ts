"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { projectTransactionKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STALE_TIME = 5 * 60_000

export type ProjectTransaction = Tables<'project_transactions'>
export type TransactionType = 'income' | 'expense'

export interface ProjectTransactionFormData {
  type: TransactionType
  /** ISO-дата (YYYY-MM-DD). */
  date: string
  /** Контрагент (от кого / кому) — необязательно. */
  participant_id: string | null
  /** Статья (за что) — необязательно. */
  service_id: string | null
  amount: number
  comment: string | null
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
        // Сначала новые даты сверху; внутри одного дня — в порядке
        // добавления (старая запись выше, новая ниже).
        .order('date', { ascending: false })
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
          service_id: form.service_id,
          amount: form.amount,
          comment: form.comment?.trim() || null,
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
          service_id: params.form.service_id,
          amount: params.form.amount,
          comment: params.form.comment?.trim() || null,
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
  service_id: string | null
  amount: number
  comment: string | null
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
