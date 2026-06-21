"use client"

/**
 * Настройки сайдбара воркспейса: read + upsert.
 *
 * С 2026-06-21 сайдбар-слоты живут внутри «Профиля настроек» (interface_presets),
 * а не в workspace_sidebar_settings. Эти хуки — тонкие адаптеры над активным
 * профилем пользователя, чтобы потребители (WorkspaceSidebarFull, SidebarSettingsTab)
 * не переписывать. Чтение — любому участнику; запись — владельцу (RLS профиля).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  STALE_TIME,
  myTaskCountsKeys,
  interfacePresetKeys,
  workspaceSidebarSettingsKeys,
} from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { type SidebarSlot } from '@/lib/sidebarSettings'
import {
  useActiveInterfacePreset,
  writeSlotsToActivePreset,
} from '@/hooks/useInterfacePresets'

/** Чтение слотов активного профиля. Если профилей нет — дефолты. */
export function useWorkspaceSidebarSettings(workspaceId: string | undefined) {
  const { slots, presetId, isLoading } = useActiveInterfacePreset(workspaceId)
  return {
    data: { slots, exists: Boolean(presetId) },
    isLoading,
  }
}

export type UpdateSidebarSettingsParams = {
  workspaceId: string
  slots: SidebarSlot[]
}

export function useUpdateWorkspaceSidebarSettings() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: UpdateSidebarSettingsParams) => {
      await writeSlotsToActivePreset(params.workspaceId, user?.id, params.slots)
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: interfacePresetKeys.byWorkspace(vars.workspaceId),
      })
      queryClient.invalidateQueries({
        queryKey: interfacePresetKeys.active(vars.workspaceId, user?.id),
      })
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
