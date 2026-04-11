"use client"

import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME } from '@/hooks/queryKeys'

const PINNED_KEY = (userId: string, workspaceId: string) =>
  ['pinned-boards', userId, workspaceId] as const

/** Хук для управления закреплёнными досками в сайдбаре (БД) */
export function usePinnedBoards(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const qk = useMemo(
    () => (user && workspaceId ? PINNED_KEY(user.id, workspaceId) : ['pinned-boards', 'none']),
    [user, workspaceId],
  )

  const { data: pinnedIds = [] } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      if (!user || !workspaceId) return []
      const { data } = await supabase
        .from('pinned_boards')
        .select('board_id, position')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .order('position')
      return data?.map((r) => r.board_id) ?? []
    },
    enabled: !!user && !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
  })

  const toggleMutation = useMutation({
    mutationFn: async (boardId: string) => {
      if (!user || !workspaceId) return
      const isPinned = pinnedIds.includes(boardId)
      if (isPinned) {
        await supabase
          .from('pinned_boards')
          .delete()
          .eq('user_id', user.id)
          .eq('workspace_id', workspaceId)
          .eq('board_id', boardId)
      } else {
        const maxPos = pinnedIds.length
        await supabase.from('pinned_boards').insert({
          user_id: user.id,
          workspace_id: workspaceId,
          board_id: boardId,
          position: maxPos,
        })
      }
    },
    onMutate: async (boardId) => {
      await queryClient.cancelQueries({ queryKey: qk })
      const prev = queryClient.getQueryData<string[]>(qk) ?? []
      const next = prev.includes(boardId)
        ? prev.filter((id) => id !== boardId)
        : [...prev, boardId]
      queryClient.setQueryData(qk, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk })
    },
  })

  const togglePin = useCallback(
    (boardId: string) => toggleMutation.mutate(boardId),
    [toggleMutation],
  )

  const isPinned = useCallback(
    (boardId: string) => pinnedIds.includes(boardId),
    [pinnedIds],
  )

  return { pinnedIds, togglePin, isPinned }
}
