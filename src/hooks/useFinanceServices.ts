"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { financeServiceKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STALE_TIME = 5 * 60_000

export type FinanceService = Tables<'finance_services'>

export interface FinanceServiceFormData {
  name: string
  base_price: number
}

/**
 * Список услуг воркспейса (без удалённых), отсортирован по имени.
 */
export function useFinanceServices(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? financeServiceKeys.list(workspaceId) : ['finance-services', 'list', 'none'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<FinanceService[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('finance_services')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as FinanceService[]
    },
  })
}

export function useCreateFinanceService(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: FinanceServiceFormData): Promise<FinanceService> => {
      if (!workspaceId) throw new Error('workspaceId required')
      const { data, error } = await supabase
        .from('finance_services')
        .insert({
          workspace_id: workspaceId,
          name: form.name.trim(),
          base_price: form.base_price,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as FinanceService
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeServiceKeys.list(workspaceId) })
    },
  })
}

export function useUpdateFinanceService(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; form: FinanceServiceFormData }): Promise<FinanceService> => {
      const { data, error } = await supabase
        .from('finance_services')
        .update({
          name: params.form.name.trim(),
          base_price: params.form.base_price,
        })
        .eq('id', params.id)
        .select('*')
        .single()
      if (error) throw error
      return data as FinanceService
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeServiceKeys.list(workspaceId) })
    },
  })
}

/**
 * Мягкое удаление: is_deleted = true. Услуги не пропадают из проектов
 * (там лежит snapshot имени и цены), но больше не показываются в выборе.
 */
export function useDeleteFinanceService(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('finance_services')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (!workspaceId) return
      queryClient.invalidateQueries({ queryKey: financeServiceKeys.list(workspaceId) })
    },
  })
}
