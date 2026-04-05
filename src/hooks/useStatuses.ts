"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { statusKeys } from '@/hooks/queryKeys'
import type { Tables } from '@/types/database'

const STATUS_STALE_TIME = 5 * 60_000

type EntityType = 'document' | 'task' | 'document_kit'
export type TaskStatus = Tables<'statuses'>

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
