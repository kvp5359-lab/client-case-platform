"use client"

/**
 * WorkspaceProvider — loads workspace data via React Query (useWorkspace hook).
 * Provides workspaceId + workspace data to the tree via React Context.
 * Saves last_workspace_id to user_settings on mount.
 */

import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { useWorkspace } from '@/hooks/useWorkspace'
import { logger } from '@/utils/logger'
import type { Workspace } from '@/types/entities'

type WorkspaceContextValue = {
  workspaceId: string | undefined
  workspace: Workspace | undefined
  isLoading: boolean
  error: Error | null
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaceId: undefined,
  workspace: undefined,
  isLoading: false,
  error: null,
})

export function useWorkspaceContext() {
  return useContext(WorkspaceContext)
}

type WorkspaceProviderProps = {
  children: ReactNode
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()
  const userId = user?.id

  const { data: workspace, isLoading, error } = useWorkspace(workspaceId)

  // Save last_workspace_id to user_settings after workspace loads
  useEffect(() => {
    if (!workspaceId || !userId || !workspace) return

    let cancelled = false

    const saveLastWorkspace = async () => {
      if (cancelled) return
      try {
        await supabase
          .from('user_settings')
          .upsert({ user_id: userId, last_workspace_id: workspaceId }, { onConflict: 'user_id' })
      } catch (err) {
        logger.warn('Ошибка сохранения последнего workspace:', err)
      }
    }

    saveLastWorkspace()
    return () => {
      cancelled = true
    }
  }, [workspaceId, userId, workspace])

  // Мемоизируем value: иначе новый объект-литерал на каждый рендер провайдера
  // ре-рендерит всех потребителей контекста.
  const value = useMemo(
    () => ({ workspaceId, workspace, isLoading, error }),
    [workspaceId, workspace, isLoading, error],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}
