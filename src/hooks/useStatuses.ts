"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { statusKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STATUS_STALE_TIME = 5 * 60_000

type EntityType = 'document' | 'task' | 'document_kit' | 'project'
export type TaskStatus = Tables<'statuses'>
export type ProjectStatus = Tables<'statuses'>

/**
 * Project-статус с per-template флагами (приходят из junction).
 * Базовый Status describes сам справочный статус (имя, цвет, иконка),
 * а order_index/is_default/is_final зависят от шаблона.
 */
export type TemplateProjectStatus = Tables<'statuses'> & {
  /** Поле order_index из junction project_template_statuses, переписывает базовое. */
  order_index: number
  /** Per-template флаг — может отличаться у одного и того же статуса в разных шаблонах. */
  is_default: boolean
  is_final: boolean
}

/**
 * Приватный базовый хук — загружает статусы по entity_type
 */
function useStatusesByEntityType(
  entityType: EntityType,
  queryKey: readonly unknown[],
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('entity_type', entityType)
        .eq('workspace_id', workspaceId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
    staleTime: STATUS_STALE_TIME,
  })
}

/**
 * Хук для загрузки статусов для документов
 */
export function useDocumentStatuses(workspaceId: string | undefined) {
  return useStatusesByEntityType('document', statusKeys.document(workspaceId ?? ''), workspaceId)
}

/**
 * Хук для загрузки статусов задач
 */
export function useTaskStatuses(workspaceId: string | undefined) {
  return useStatusesByEntityType('task', statusKeys.task(workspaceId ?? ''), workspaceId)
}

/**
 * Хук для загрузки статусов наборов документов (используются для папок)
 */
export function useDocumentKitStatuses(workspaceId: string | undefined) {
  return useStatusesByEntityType(
    'document_kit',
    statusKeys.documentKit(workspaceId ?? ''),
    workspaceId,
  )
}

/**
 * Все project-статусы воркспейса — единый справочник без привязки к шаблонам.
 * Используется в фильтрах по статусу проекта (на досках и в списке проектов)
 * и при добавлении статусов в конкретный шаблон через диалог выбора.
 */
export function useAllProjectStatuses(workspaceId: string | undefined) {
  return useStatusesByEntityType('project', statusKeys.project(workspaceId ?? ''), workspaceId)
}

/**
 * Project-статусы конкретного шаблона. JOIN на junction
 * project_template_statuses, флаги order_index/is_default/is_final берутся
 * оттуда (per-template). Возвращает массив, готовый к показу в селекторе.
 */
export function useProjectStatusesForTemplate(
  workspaceId: string | undefined,
  templateId: string | null | undefined,
) {
  return useQuery({
    queryKey: statusKeys.projectByTemplate(workspaceId, templateId),
    queryFn: async (): Promise<TemplateProjectStatus[]> => {
      if (!workspaceId || !templateId) return []
      const { data, error } = await supabase
        .from('project_template_statuses')
        .select('order_index, is_default, is_final, statuses(*)')
        .eq('template_id', templateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      type Row = { order_index: number; is_default: boolean; is_final: boolean; statuses: Tables<'statuses'> | null }
      return (data as unknown as Row[])
        .filter((r) => r.statuses !== null)
        .map((r) => ({
          ...(r.statuses as Tables<'statuses'>),
          order_index: r.order_index,
          is_default: r.is_default,
          is_final: r.is_final,
        }))
    },
    enabled: !!workspaceId && !!templateId,
    staleTime: STATUS_STALE_TIME,
  })
}
