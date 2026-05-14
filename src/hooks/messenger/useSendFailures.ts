"use client"

/**
 * Журнал ошибок отправки сообщений (`message_send_failures`).
 *
 *  - `useMyUnresolvedSendFailures(workspaceId)` — мои незакрытые ошибки.
 *    Initial fetch + realtime-подписка на INSERT/UPDATE. Обновляется когда
 *    appears новый failure (другая вкладка / другое устройство этого юзера),
 *    и когда я (или менеджер) пометил failure как resolved.
 *
 *  - `useWorkspaceSendFailures(workspaceId, includeResolved)` — все failures
 *    воркспейса для страницы менеджера. Менеджер увидит failures всех юзеров
 *    своего WS благодаря RLS-политике на таблице.
 *
 *  - `useResolveSendFailure()` / `useResolveAllMySendFailures(workspaceId)` —
 *    мутации, выставляют `resolved_at + resolved_by`.
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { sendFailureKeys } from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

export type SendFailureRow = Database['public']['Tables']['message_send_failures']['Row']

export function useMyUnresolvedSendFailures(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const enabled = !!workspaceId && !!user

  const query = useQuery({
    queryKey: workspaceId ? sendFailureKeys.myUnresolved(workspaceId) : ['send-failures', 'noop'],
    enabled,
    queryFn: async (): Promise<SendFailureRow[]> => {
      if (!user || !workspaceId) return []
      const { data, error } = await supabase
        .from('message_send_failures')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as SendFailureRow[]
    },
    staleTime: 30_000,
  })

  // Realtime: новые failures (от других вкладок/устройств) + resolve-апдейты.
  useEffect(() => {
    if (!enabled || !workspaceId || !user) return
    const channel = supabase
      .channel(`send-failures:${workspaceId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_send_failures',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as SendFailureRow
          if (row.workspace_id !== workspaceId) return
          if (row.resolved_at) return
          queryClient.setQueryData<SendFailureRow[]>(
            sendFailureKeys.myUnresolved(workspaceId),
            (prev) => {
              if (!prev) return [row]
              if (prev.some((r) => r.id === row.id)) return prev
              return [row, ...prev]
            },
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_send_failures',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as SendFailureRow
          if (row.workspace_id !== workspaceId) return
          queryClient.setQueryData<SendFailureRow[]>(
            sendFailureKeys.myUnresolved(workspaceId),
            (prev) => {
              if (!prev) return prev
              if (row.resolved_at) return prev.filter((r) => r.id !== row.id)
              return prev.map((r) => (r.id === row.id ? row : r))
            },
          )
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, workspaceId, user, queryClient])

  return query
}

export function useWorkspaceSendFailures(
  workspaceId: string | undefined,
  includeResolved: boolean,
) {
  return useQuery({
    queryKey: workspaceId
      ? sendFailureKeys.workspaceAll(workspaceId, includeResolved)
      : ['send-failures', 'noop'],
    enabled: !!workspaceId,
    queryFn: async (): Promise<SendFailureRow[]> => {
      if (!workspaceId) return []
      let q = supabase
        .from('message_send_failures')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (!includeResolved) q = q.is('resolved_at', null)
      const { data, error } = await q
      if (error) throw error
      return data as SendFailureRow[]
    },
    staleTime: 30_000,
  })
}

export function useResolveSendFailure(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Не авторизован')
      const { error } = await supabase
        .from('message_send_failures')
        .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: sendFailureKeys.myUnresolved(workspaceId) })
        queryClient.invalidateQueries({
          queryKey: ['send-failures', 'workspace-all', workspaceId],
        })
      }
    },
  })
}

export function useResolveAllMySendFailures(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!user || !workspaceId) throw new Error('Нет данных')
      const { error } = await supabase
        .from('message_send_failures')
        .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .is('resolved_at', null)
      if (error) throw error
    },
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: sendFailureKeys.myUnresolved(workspaceId) })
      }
    },
  })
}
