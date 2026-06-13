"use client"

/**
 * Настройки сайдбара воркспейса: read + upsert.
 * Чтение — любому участнику; upsert — только владельцу (RLS).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  GC_TIME,
  STALE_TIME,
  workspaceSidebarSettingsKeys,
  myTaskCountsKeys,
} from '@/hooks/queryKeys'
import {
  type SidebarSlot,
  normalizeSidebarSlots,
  DEFAULT_SIDEBAR_SLOTS,
} from '@/lib/sidebarSettings'
import { toSupabaseJson } from '@/utils/supabaseJson'

/** Чтение настроек. Если строки нет — возвращает дефолты. */
export function useWorkspaceSidebarSettings(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId
      ? workspaceSidebarSettingsKeys.byWorkspace(workspaceId)
      : ['workspace-sidebar-settings', 'noop'],
    enabled: Boolean(workspaceId),
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.STANDARD,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_sidebar_settings')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .maybeSingle()
      if (error) throw error as Error
      const slots = data?.slots
        ? normalizeSidebarSlots(data.slots)
        : DEFAULT_SIDEBAR_SLOTS
      return { slots, exists: Boolean(data) }
    },
  })
}

export type UpdateSidebarSettingsParams = {
  workspaceId: string
  slots: SidebarSlot[]
}

export function useUpdateWorkspaceSidebarSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateSidebarSettingsParams) => {
      const { error } = await supabase
        .from('workspace_sidebar_settings')
        .upsert(
          {
            workspace_id: params.workspaceId,
            slots: toSupabaseJson(params.slots),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
      if (error) throw error as Error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: workspaceSidebarSettingsKeys.byWorkspace(vars.workspaceId),
      })
    },
  })
}

export type MyTaskCounts = {
  active: number
  all: number
  overdue: number
}

/** Батч-счётчик «моих» задач (active/all/overdue) для бейджей сайдбара. */
export function useMyTaskCounts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId
      ? myTaskCountsKeys.byWorkspace(workspaceId)
      : ['my-task-counts', 'noop'],
    enabled: Boolean(workspaceId),
    staleTime: STALE_TIME.STANDARD,
    queryFn: async (): Promise<MyTaskCounts> => {
      const { data, error } = await supabase.rpc('get_my_task_counts', {
        p_workspace_id: workspaceId!,
      })
      if (error) throw error as Error
      const obj = (data ?? {}) as Partial<MyTaskCounts>
      return {
        active: Number(obj.active ?? 0),
        all: Number(obj.all ?? 0),
        overdue: Number(obj.overdue ?? 0),
      }
    },
  })
}
