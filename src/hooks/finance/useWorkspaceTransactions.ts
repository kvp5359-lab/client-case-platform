"use client"

/**
 * useWorkspaceTransactions — общий журнал доходов/расходов воркспейса
 * (страница «Финансы»). Читает project_transactions всех проектов воркспейса
 * одним запросом (join projects за именем). Мутации принимают project_id
 * явно — операция создаётся/редактируется в выбранном проекте.
 *
 * Инвалидация двусторонняя: мутации отсюда сбрасывают и журнал воркспейса,
 * и списки затронутого проекта (вкладка «Финансы» проекта); мутации с
 * вкладки проекта сбрасывают журнал broad-prefix'ом (см. useProjectTransactions).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { projectTransactionKeys, workspaceTransactionKeys } from '@/hooks/queryKeys'
import type {
  ProjectTransaction,
  ProjectTransactionFormData,
  ProjectTransactionPatch,
} from '@/hooks/projects/useProjectTransactions'

const STALE_TIME = 5 * 60_000

export type WorkspaceTransaction = ProjectTransaction & {
  project_name: string
  /** Валюта проекта (NULL = базовая воркспейса). */
  project_currency: string | null
}

/** Все транзакции воркспейса, новые сверху (date DESC, created_at DESC). */
export function useWorkspaceTransactions(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceTransactionKeys.list(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: STALE_TIME,
    queryFn: async (): Promise<WorkspaceTransaction[]> => {
      const { data, error } = await supabase
        .from('project_transactions')
        .select('*, projects!inner(id, name, currency, workspace_id, is_deleted)')
        .eq('projects.workspace_id', workspaceId!)
        .eq('projects.is_deleted', false)
        .eq('is_deleted', false)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      type Row = ProjectTransaction & {
        projects: { id: string; name: string; currency: string | null } | null
      }
      return ((data ?? []) as Row[]).map(({ projects, ...t }) => ({
        ...t,
        project_name: projects?.name ?? '—',
        project_currency: projects?.currency ?? null,
      }))
    },
  })
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string | undefined,
  projectIds: (string | null | undefined)[],
) {
  if (workspaceId) {
    queryClient.invalidateQueries({ queryKey: workspaceTransactionKeys.list(workspaceId) })
  }
  for (const projectId of projectIds) {
    if (!projectId) continue
    queryClient.invalidateQueries({ queryKey: projectTransactionKeys.list(projectId, 'income') })
    queryClient.invalidateQueries({ queryKey: projectTransactionKeys.list(projectId, 'expense') })
  }
}

export function useCreateWorkspaceTransaction(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      projectId: string
      form: ProjectTransactionFormData
    }): Promise<ProjectTransaction> => {
      const { data, error } = await supabase
        .from('project_transactions')
        .insert({
          project_id: params.projectId,
          type: params.form.type,
          date: params.form.date,
          participant_id: params.form.participant_id,
          category_id: params.form.category_id,
          amount: params.form.amount,
          comment: params.form.comment?.trim() || null,
          tax_rate_id: params.form.tax_rate_id,
          tax_rate: params.form.tax_rate,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as ProjectTransaction
    },
    onSuccess: (_data, params) => invalidate(queryClient, workspaceId, [params.projectId]),
  })
}

export function useUpdateWorkspaceTransaction(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      /** Новый проект операции (может отличаться от прежнего — перенос). */
      projectId: string
      /** Прежний проект — для инвалидации его списков. */
      prevProjectId: string
      form: ProjectTransactionFormData
    }): Promise<ProjectTransaction> => {
      const { data, error } = await supabase
        .from('project_transactions')
        .update({
          project_id: params.projectId,
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
    onSuccess: (_data, params) =>
      invalidate(queryClient, workspaceId, [params.projectId, params.prevProjectId]),
  })
}

/** Патч на общем журнале дополнительно позволяет перенос в другой проект. */
export type WorkspaceTransactionPatch = ProjectTransactionPatch & {
  project_id?: string
}

/**
 * Частичное обновление для inline-редактирования в журнале.
 * `projectIds` — все затронутые проекты (текущий + новый при переносе),
 * их списки на вкладке «Финансы» проекта инвалидируются.
 */
export function usePatchWorkspaceTransaction(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      patch: WorkspaceTransactionPatch
      projectIds: string[]
    }): Promise<void> => {
      const { error } = await supabase
        .from('project_transactions')
        .update(params.patch)
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_data, params) => invalidate(queryClient, workspaceId, params.projectIds),
  })
}

export function useDeleteWorkspaceTransaction(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; projectId: string }): Promise<void> => {
      const { error } = await supabase
        .from('project_transactions')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_data, params) => invalidate(queryClient, workspaceId, [params.projectId]),
  })
}
