"use client"

/**
 * Hook: useConnectGmail
 * Handles Gmail OAuth popup flow.
 * Pattern identical to Google Drive connection in ProfilePage.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { supabase } from '@/lib/supabase'
import { emailAccountKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'

/**
 * @param workspaceIdOverride — explicit workspaceId (e.g. from settings.last_workspace_id).
 * Falls back to WorkspaceContext workspaceId.
 */
export function useConnectGmail(workspaceIdOverride?: string | null) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { workspaceId: ctxWorkspaceId } = useWorkspaceContext()
  const currentWorkspaceId = workspaceIdOverride || ctxWorkspaceId

  const [loading, setLoading] = useState(false)
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (popupCheckRef.current) {
        clearInterval(popupCheckRef.current)
        popupCheckRef.current = null
      }
    }
  }, [])

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (!event.data || typeof event.data !== 'object' || typeof event.data.type !== 'string')
        return

      if (event.data.type === 'gmail-auth-success') {
        toast.success('Gmail успешно подключён!')
        setLoading(false)
        if (user) {
          queryClient.invalidateQueries({ queryKey: emailAccountKeys.byUser(user.id) })
        }
      } else if (event.data.type === 'gmail-auth-error') {
        toast.error(`Ошибка подключения Gmail: ${event.data.error}`)
        setLoading(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event listener only depends on user.id for auth check, other deps are stable refs
  }, [user?.id])

  const connect = useCallback(async () => {
    if (!user) {
      toast.error('Необходима авторизация')
      return
    }
    if (!currentWorkspaceId) {
      toast.error('Выберите рабочее пространство')
      return
    }

    try {
      setLoading(true)

      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { origin: window.location.origin, workspaceId: currentWorkspaceId },
      })

      if (error || !data?.authUrl) {
        toast.error('Не удалось получить ссылку для авторизации Gmail')
        setLoading(false)
        return
      }

      // Open OAuth popup
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        data.authUrl,
        'GmailAuth',
        `width=${width},height=${height},left=${left},top=${top}`,
      )

      if (!popup) {
        toast.error('Не удалось открыть окно авторизации. Разрешите всплывающие окна.')
        setLoading(false)
        return
      }

      // Check if popup was closed manually
      if (popupCheckRef.current) {
        clearInterval(popupCheckRef.current)
      }
      if (!isMountedRef.current) return
      popupCheckRef.current = setInterval(() => {
        if (popup.closed) {
          if (popupCheckRef.current) {
            clearInterval(popupCheckRef.current)
            popupCheckRef.current = null
          }
          if (isMountedRef.current) {
            setLoading(false)
          }
        }
      }, 500)
    } catch {
      toast.error('Ошибка при подключении Gmail')
      setLoading(false)
    }
  }, [user, currentWorkspaceId])

  return { connect, loading }
}
