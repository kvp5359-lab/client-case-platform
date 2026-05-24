"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { projectServiceKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STALE_TIME = 5 * 60_000

export type ProjectService = Tables<'project_services'>

export type ProjectServiceFormData = {
  /** UUID услуги из справочника finance_services. */
  service_id: string | null
  /** Snapshot имени (по умолчанию из справочника, но можно править). */
  name: string
  quantity: number
  /** Цена за единицу в EUR (без налога). */
  price: number
  /** UUID ставки налога из справочника finance_tax_rates (или null). */
  tax_rate_id: string | null
  /** Snapshot процента налога (накручивается сверху на subtotal). */
  tax_rate: number | null
}

/** Список услуг проекта (без удалённых), отсортирован по sort_order. */
export function useProjectServices(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? projectServiceKeys.list(projectId) : ['project-services', 'list', 'none'],
    enabled: !!projectId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<ProjectService[]> => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from('project_services')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectService[]
    },
  })
}

export function useCreateProjectService(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: ProjectServiceFormData): Promise<ProjectService> => {
      if (!projectId) throw new Error('projectId required')
      // Новая позиция в конец списка
      const { data: maxOrderData } = await supabase
        .from('project_services')
        .select('sort_order')
        .eq('project_id', projectId)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextOrder = (maxOrderData?.[0]?.sort_order ?? -1) + 1

      const { data, error } = await supabase
        .from('project_services')
        .insert({
          project_id: projectId,
          service_id: form.service_id,
          name: form.name.trim(),
          quantity: form.quantity,
          price: form.price,
          tax_rate_id: form.tax_rate_id,
          tax_rate: form.tax_rate,
          sort_order: nextOrder,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as ProjectService
    },
    onSuccess: () => {
      if (!projectId) return
      queryClient.invalidateQueries({ queryKey: projectServiceKeys.list(projectId) })
    },
  })
}

export function useUpdateProjectService(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; form: ProjectServiceFormData }): Promise<ProjectService> => {
      const { data, error } = await supabase
        .from('project_services')
        .update({
          service_id: params.form.service_id,
          name: params.form.name.trim(),
          quantity: params.form.quantity,
          price: params.form.price,
          tax_rate_id: params.form.tax_rate_id,
          tax_rate: params.form.tax_rate,
        })
        .eq('id', params.id)
        .select('*')
        .single()
      if (error) throw error
      return data as ProjectService
    },
    onSuccess: () => {
      if (!projectId) return
      queryClient.invalidateQueries({ queryKey: projectServiceKeys.list(projectId) })
    },
  })
}

/**
 * Частичное обновление одного поля строки услуги — для inline-редактирования
 * прямо в таблице. Принимает только те поля, которые надо обновить;
 * остальные не трогаются.
 */
export type ProjectServicePatch = Partial<{
  service_id: string | null
  name: string
  quantity: number
  price: number
  tax_rate_id: string | null
  tax_rate: number | null
}>

export function usePatchProjectService(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; patch: ProjectServicePatch }): Promise<void> => {
      const { error } = await supabase
        .from('project_services')
        .update(params.patch)
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      if (!projectId) return
      queryClient.invalidateQueries({ queryKey: projectServiceKeys.list(projectId) })
    },
  })
}

/** Мягкое удаление: is_deleted=true. Сумма проекта пересчитается автоматически. */
export function useDeleteProjectService(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('project_services')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (!projectId) return
      queryClient.invalidateQueries({ queryKey: projectServiceKeys.list(projectId) })
    },
  })
}

/**
 * Перестановка порядка после DnD. Принимает массив id в новом порядке;
 * sort_order проставляется по индексу.
 */
export function useReorderProjectServices(projectId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (idsInOrder: string[]): Promise<void> => {
      const updates = idsInOrder.map((id, index) =>
        supabase
          .from('project_services')
          .update({ sort_order: index })
          .eq('id', id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onError: () => {
      // На ошибке перезагрузим из БД (откат optimistic update)
      if (!projectId) return
      queryClient.invalidateQueries({ queryKey: projectServiceKeys.list(projectId) })
    },
  })
}
