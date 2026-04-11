"use client"

import { useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME } from '@/hooks/queryKeys'

const PINNED_KEY = (userId: string, workspaceId: string) =>
  ['pinned-projects', userId, workspaceId] as const

/** Хук для управления закреплёнными проектами через БД */
export function usePinnedProjects(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const qk = useMemo(
    () => (user && workspaceId ? PINNED_KEY(user.id, workspaceId) : ['pinned-projects', 'none']),
    [user, workspaceId],
  )

  const { data: pinnedIds = [] } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      if (!user || !workspaceId) return []
      const { data } = await supabase
        .from('pinned_projects')
        .select('project_id, position')
        .eq('user_id', user.id)
        .eq('workspace_id', workspaceId)
        .order('position')
      return data?.map((r) => r.project_id) ?? []
    },
    enabled: !!user && !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
  })

  // Миграция из localStorage → БД (один раз)
  useEffect(() => {
    if (!user || !workspaceId) return
    const lsKey = `cc:pinned-projects:${workspaceId}`
    const raw = localStorage.getItem(lsKey)
    if (!raw) return
    let ids: string[]
    try {
      ids = JSON.parse(raw)
    } catch {
      return
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      localStorage.removeItem(lsKey)
      return
    }
    // Вставляем в БД и удаляем из localStorage
    const rows = ids.map((projectId, i) => ({
      user_id: user.id,
      workspace_id: workspaceId,
      project_id: projectId,
      position: i,
    }))
    supabase
      .from('pinned_projects')
      .upsert(rows, { onConflict: 'user_id,workspace_id,project_id' })
      .then(() => {
        localStorage.removeItem(lsKey)
        queryClient.invalidateQueries({ queryKey: qk })
      })
  }, [user, workspaceId, queryClient, qk])

  const toggleMutation = useMutation({
    mutationFn: async (projectId: string) => {
      if (!user || !workspaceId) return
      const isPinned = pinnedIds.includes(projectId)
      if (isPinned) {
        await supabase
          .from('pinned_projects')
          .delete()
          .eq('user_id', user.id)
          .eq('workspace_id', workspaceId)
          .eq('project_id', projectId)
      } else {
        const maxPos = pinnedIds.length
        await supabase.from('pinned_projects').insert({
          user_id: user.id,
          workspace_id: workspaceId,
          project_id: projectId,
          position: maxPos,
        })
      }
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: qk })
      const prev = queryClient.getQueryData<string[]>(qk) ?? []
      const next = prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
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
    (projectId: string) => toggleMutation.mutate(projectId),
    [toggleMutation],
  )

  const isPinned = useCallback((projectId: string) => pinnedIds.includes(projectId), [pinnedIds])

  return { pinnedIds, togglePin, isPinned }
}
