"use client"

/**
 * Адаптер для BoardsPage: показать кнопку "закрепить/открепить" на доске.
 * Закрепить = добавить slot { type:'board', placement:'list' } в конец списка.
 * Открепить = удалить slot.
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  useWorkspaceSidebarSettings,
} from '@/hooks/useWorkspaceSidebarSettings'
import { workspaceSidebarSettingsKeys } from '@/hooks/queryKeys'
import {
  type SidebarSlot,
  reorderWithinZones,
  boardIdFromSlotId,
} from '@/lib/sidebarSettings'

export function usePinnedBoards(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { data: settings } = useWorkspaceSidebarSettings(workspaceId)

  const slots: SidebarSlot[] = useMemo(() => settings?.slots ?? [], [settings])

  const pinnedIds = useMemo(() => {
    return slots
      .filter((s) => s.type === 'board')
      .sort((a, b) => a.order - b.order)
      .map((s) => boardIdFromSlotId(s.id))
      .filter((id): id is string => Boolean(id))
  }, [slots])

  const qk = workspaceId
    ? workspaceSidebarSettingsKeys.byWorkspace(workspaceId)
    : (['workspace-sidebar-settings', 'noop'] as const)

  const buildNext = (boardId: string, current: SidebarSlot[]): SidebarSlot[] => {
    const slotId = `board:${boardId}`
    const exists = current.some((s) => s.id === slotId)
    if (exists) {
      return reorderWithinZones(current.filter((s) => s.id !== slotId))
    }
    // Закрепляем в конец списка.
    const listMax = current
      .filter((s) => s.placement === 'list')
      .reduce((m, s) => Math.max(m, s.order), -1)
    return reorderWithinZones([
      ...current,
      {
        id: slotId,
        type: 'board',
        placement: 'list',
        order: listMax + 1,
        badge_mode: 'disabled',
      },
    ])
  }

  const toggleMutation = useMutation({
    mutationFn: async (boardId: string) => {
      if (!workspaceId) return
      const next = buildNext(boardId, slots)
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
        .upsert(
          {
            workspace_id: workspaceId,
            slots: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
      if (error) throw error as Error
    },
    onMutate: async (boardId) => {
      if (!workspaceId) return
      await queryClient.cancelQueries({ queryKey: qk })
      const prev = queryClient.getQueryData(qk)
      queryClient.setQueryData(qk, (old: unknown) => {
        const prevSettings = (old ?? { slots: [], exists: false }) as {
          slots: SidebarSlot[]
          exists: boolean
        }
        return { ...prevSettings, slots: buildNext(boardId, prevSettings.slots ?? []) }
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(qk, ctx.prev)
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
