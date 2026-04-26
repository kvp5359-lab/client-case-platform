"use client"

/**
 * Настройки Дневника проекта на уровне воркспейса.
 * Хранятся в workspace_digest_settings; редактирует только владелец.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  GC_TIME,
  STALE_TIME,
  workspaceDigestSettingsKeys,
} from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

export type WorkspaceDigestSettings = Database['public']['Tables']['workspace_digest_settings']['Row']
type SettingsUpdate = Database['public']['Tables']['workspace_digest_settings']['Update']

export function useWorkspaceDigestSettings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? workspaceDigestSettingsKeys.byWorkspace(workspaceId) : ['ws-digest-settings', 'noop'],
    enabled: Boolean(workspaceId),
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.STANDARD,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_digest_settings')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .maybeSingle()
      if (error) throw error
      return data as WorkspaceDigestSettings | null
    },
  })
}

export interface UpdateSettingsParams {
  workspaceId: string
  systemPrompt?: string | null
  minEventsForLlm?: number
  model?: string
}

export function useUpdateWorkspaceDigestSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateSettingsParams) => {
      const payload: SettingsUpdate & { workspace_id: string } = {
        workspace_id: params.workspaceId,
        updated_at: new Date().toISOString(),
      }
      if (params.systemPrompt !== undefined) payload.system_prompt = params.systemPrompt
      if (params.minEventsForLlm !== undefined) payload.min_events_for_llm = params.minEventsForLlm
      if (params.model !== undefined) payload.model = params.model

      const { data, error } = await supabase
        .from('workspace_digest_settings')
        .upsert(payload, { onConflict: 'workspace_id' })
        .select('*')
        .single()
      if (error) throw error
      return data as WorkspaceDigestSettings
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: workspaceDigestSettingsKeys.byWorkspace(vars.workspaceId),
      })
    },
  })
}
