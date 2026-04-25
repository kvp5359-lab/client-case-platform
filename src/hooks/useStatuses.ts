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
 * Все project-статусы воркспейса (общие + привязанные к любым шаблонам).
 * Фильтрация по конкретному шаблону происходит на стороне потребителя через
 * `useProjectStatusesForTemplate` — это позволяет одним кэшем покрыть все
 * шаблоны и не делать N запросов.
 */
export function useAllProjectStatuses(workspaceId: string | undefined) {
  return useStatusesByEntityType('project', statusKeys.project(workspaceId ?? ''), workspaceId)
}

/**
 * Возвращает статусы, видимые проекту с заданным `templateId`.
 *
 * Правило наследования:
 * - если шаблон задан и у него есть свои статусы (project_template_id = templateId)
 *   — показываем только их;
 * - иначе — общие статусы воркспейса (project_template_id = null).
 *
 * Это даёт одной командой настроенный набор для шаблона и фолбэк на воркспейс
 * для проектов без шаблона / шаблонов без своих статусов.
 */
export function useProjectStatusesForTemplate(
  workspaceId: string | undefined,
  templateId: string | null | undefined,
) {
  const all = useAllProjectStatuses(workspaceId)
  const data = (all.data ?? []).filter((s) => {
    const hasTemplateOwn =
      templateId != null && (all.data ?? []).some((x) => x.project_template_id === templateId)
    if (hasTemplateOwn) return s.project_template_id === templateId
    return s.project_template_id === null
  })
  return { ...all, data }
}
