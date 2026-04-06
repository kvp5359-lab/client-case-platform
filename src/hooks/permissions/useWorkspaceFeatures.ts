"use client"

/**
 * Хук для проверки включённых фич workspace
 */

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import { permissionKeys } from '../queryKeys'
import type { WorkspaceFeature, WorkspaceFeatures } from '../../types/permissions'
import { fromSupabaseJson } from '@/utils/supabaseJson'

interface UseWorkspaceFeaturesOptions {
  workspaceId?: string
}

export interface WorkspaceFeaturesResult {
  /** Загрузка данных */
  isLoading: boolean
  /** Ошибка загрузки */
  error: Error | null
  /** Проверка, включена ли фича */
  isEnabled: (feature: WorkspaceFeature) => boolean
  /** Все фичи */
  features: WorkspaceFeatures | null
  /** Перезагрузить данные */
  refetch: () => void
}

/**
 * Хук для проверки включённых фич workspace
 */
export function useWorkspaceFeatures(
  options: UseWorkspaceFeaturesOptions = {},
): WorkspaceFeaturesResult {
  const { workspaceId: ctxWorkspaceId } = useWorkspaceContext()
  const workspaceId = options.workspaceId || ctxWorkspaceId

  const {
    data: featuresData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: permissionKeys.workspaceFeatures(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return null

      const { data, error } = await supabase
        .from('workspace_features')
        .select('features')
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (error) throw error
      return data?.features ? fromSupabaseJson<WorkspaceFeatures>(data.features) : null
    },
    enabled: !!workspaceId,
  })

  const isEnabled = useCallback(
    (feature: WorkspaceFeature): boolean => {
      if (!featuresData) return false
      return featuresData[feature] === true
    },
    [featuresData],
  )

  return {
    isLoading,
    error,
    isEnabled,
    features: featuresData || null,
    refetch,
  }
}
