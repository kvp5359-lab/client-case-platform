"use client"

/**
 * Адаптер для item_lists: показать кнопку «закрепить/открепить» в сайдбаре.
 * Закрепить = добавить slot { type:'list', placement:'list' } в конец списка.
 * Открепить = удалить slot.
 *
 * Зеркалит usePinnedBoards (только slot id меняется на 'list:<uuid>').
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspaceSidebarSettings } from '@/hooks/useWorkspaceSidebarSettings'
import { workspaceSidebarSettingsKeys } from '@/hooks/queryKeys'
import {
  type SidebarSlot,
  reorderWithinZones,
  listIdFromSlotId,
} from '@/lib/sidebarSettings'

export function usePinnedItemLists(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { data: settings } = useWorkspaceSidebarSettings(workspaceId)

  const slots: SidebarSlot[] = useMemo(() => settings?.slots ?? [], [settings])

  const pinnedIds = useMemo(() => {
    return slots
      .filter((s) => s.type === 'list')
      .sort((a, b) => a.order - b.order)
      .map((s) => listIdFromSlotId(s.id))
      .filter((id): id is string => Boolean(id))
  }, [slots])

  const qk = workspaceId
    ? workspaceSidebarSettingsKeys.byWorkspace(workspaceId)
    : (['workspace-sidebar-settings', 'noop'] as const)

  const buildNext = (listId: string, current: SidebarSlot[]): SidebarSlot[] => {
    const slotId = `list:${listId}`
    const exists = current.some((s) => s.id === slotId)
    if (exists) {
      return reorderWithinZones(current.filter((s) => s.id !== slotId))
    }
    const listMax = current
      .filter((s) => s.placement === 'list')
      .reduce((m, s) => Math.max(m, s.order), -1)
    return reorderWithinZones([
      ...current,
      {
        id: slotId,
        type: 'list',
        placement: 'list',
        order: listMax + 1,
        badge_mode: 'disabled',
      },
    ])
  }

  const toggleMutation = useMutation({
    mutationFn: async (listId: string) => {
      if (!workspaceId) return
      const next = buildNext(listId, slots)
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
    onMutate: async (listId) => {
      if (!workspaceId) return
      await queryClient.cancelQueries({ queryKey: qk })
      const prev = queryClient.getQueryData(qk)
      queryClient.setQueryData(qk, (old: unknown) => {
        const prevSettings = (old ?? { slots: [], exists: false }) as {
          slots: SidebarSlot[]
          exists: boolean
        }
        return { ...prevSettings, slots: buildNext(listId, prevSettings.slots ?? []) }
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
    (listId: string) => toggleMutation.mutate(listId),
    [toggleMutation],
  )

  const isPinned = useCallback(
    (listId: string) => pinnedIds.includes(listId),
    [pinnedIds],
  )

  return { pinnedIds, togglePin, isPinned }
}
