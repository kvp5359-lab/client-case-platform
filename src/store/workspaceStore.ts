"use client"

/**
 * Workspace Store — глобальный стейт для текущего workspace
 * TODO (Z7-03): Рассмотреть миграцию на React Query — данные серверные, Zustand здесь дублирует кэш
 */

import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Workspace = Database['public']['Tables']['workspaces']['Row']

interface WorkspaceStore {
  currentWorkspaceId: string | null
  workspace: Workspace | null
  loading: boolean
  error: string | null
  /** @internal Counter to detect stale responses from parallel loadWorkspace calls */
  _requestId: number
  setCurrentWorkspaceId: (id: string | null) => void
  loadWorkspace: (workspaceId: string) => Promise<void>
  refreshWorkspace: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  currentWorkspaceId: null,
  workspace: null,
  loading: false,
  error: null,
  _requestId: 0,

  setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),

  loadWorkspace: async (workspaceId: string) => {
    // Increment request counter to detect stale responses from parallel calls
    const currentRequestId = get()._requestId + 1
    set({ loading: true, error: null, _requestId: currentRequestId })
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .single()

      if (error) throw error

      // Only apply result if this is still the latest request
      if (get()._requestId !== currentRequestId) return
      set({ workspace: data, currentWorkspaceId: workspaceId, loading: false })
    } catch (err) {
      if (get()._requestId !== currentRequestId) return
      const message =
        err instanceof Error ? err.message : 'Не удалось загрузить рабочее пространство'
      set({ error: message, workspace: null, loading: false })
    }
  },

  refreshWorkspace: async () => {
    const { currentWorkspaceId } = get()
    if (currentWorkspaceId) {
      await get().loadWorkspace(currentWorkspaceId)
    }
  },
}))

export type { Workspace }
