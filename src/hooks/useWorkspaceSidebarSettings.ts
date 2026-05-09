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
  type SidebarSettingsRow,
  normalizeSidebarSlots,
  DEFAULT_SIDEBAR_SLOTS,
  DEFAULT_COLORIZE_PROJECT_ICONS,
} from '@/lib/sidebarSettings'

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
      // Каст: типы Database регенерируются отдельно после миграции slots.
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{ data: SidebarSettingsRow | null; error: unknown }>
            }
          }
        }
      }
      const { data, error } = await client
        .from('workspace_sidebar_settings')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .maybeSingle()
      if (error) throw error as Error
      const slots = data?.slots
        ? normalizeSidebarSlots(data.slots)
        : DEFAULT_SIDEBAR_SLOTS
      const colorizeProjectIcons =
        typeof data?.colorize_project_icons === 'boolean'
          ? data.colorize_project_icons
          : DEFAULT_COLORIZE_PROJECT_ICONS
      return { slots, colorizeProjectIcons, exists: Boolean(data) }
    },
  })
}

export interface UpdateSidebarSettingsParams {
  workspaceId: string
  slots: SidebarSlot[]
  /** Опционально — если не передан, поле в БД не трогается. */
  colorizeProjectIcons?: boolean
}

export function useUpdateWorkspaceSidebarSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateSidebarSettingsParams) => {
      const payload: Record<string, unknown> = {
        workspace_id: params.workspaceId,
        slots: params.slots,
        updated_at: new Date().toISOString(),
      }
      if (typeof params.colorizeProjectIcons === 'boolean') {
        payload.colorize_project_icons = params.colorizeProjectIcons
      }

      const client = supabase as unknown as {
        from: (t: string) => {
          upsert: (
            v: Record<string, unknown>,
            o: { onConflict: string },
          ) => Promise<{ error: unknown }>
        }
      }
      const { error } = await client
        .from('workspace_sidebar_settings')
        .upsert(payload, { onConflict: 'workspace_id' })
      if (error) throw error as Error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: workspaceSidebarSettingsKeys.byWorkspace(vars.workspaceId),
      })
    },
  })
}

export interface MyTaskCounts {
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
      const client = supabase as unknown as {
        rpc: (
          name: string,
          params: { p_workspace_id: string },
        ) => Promise<{ data: Partial<MyTaskCounts> | null; error: unknown }>
      }
      const { data, error } = await client.rpc('get_my_task_counts', {
        p_workspace_id: workspaceId!,
      })
      if (error) throw error as Error
      const obj = data ?? {}
      return {
        active: Number(obj.active ?? 0),
        all: Number(obj.all ?? 0),
        overdue: Number(obj.overdue ?? 0),
      }
    },
  })
}
