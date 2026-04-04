"use client"

/**
 * WorkspaceProvider — компонент-загрузчик для workspace
 * Синхронизирует workspaceId из URL с WorkspaceStore
 * и сохраняет последний workspace в user_settings
 */

import { useEffect, ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useAuth } from './AuthContext'

interface WorkspaceProviderProps {
  children: ReactNode
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { user } = useAuth()
  const userId = user?.id
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)

  // Загрузка при монтировании и изменении workspaceId.
  // saveLastWorkspace вызывается только после успешного loadWorkspace (Z7-02).
  // Зависимость от userId вместо user предотвращает лишние перезапуски (Z7-03).
  useEffect(() => {
    if (!workspaceId) return

    let cancelled = false

    const init = async () => {
      await loadWorkspace(workspaceId)

      if (cancelled || !userId) return

      try {
        await supabase
          .from('user_settings')
          .upsert({ user_id: userId, last_workspace_id: workspaceId }, { onConflict: 'user_id' })
      } catch (err) {
        console.warn('Ошибка сохранения последнего workspace:', err)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [workspaceId, userId, loadWorkspace])

  return <>{children}</>
}
