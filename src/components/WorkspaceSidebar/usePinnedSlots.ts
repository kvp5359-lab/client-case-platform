"use client"

/**
 * Общий хук закрепления досок / списков в сайдбар воркспейса.
 * Закрепить = добавить slot { type, placement:'list' } в конец зоны «список».
 * Открепить = удалить slot.
 *
 * Параметризован типом слота ('board' | 'list'); usePinnedBoards и
 * usePinnedItemLists — тонкие обёртки над ним (раньше были двумя копиями).
 */

import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspaceSidebarSettings } from '@/hooks/useWorkspaceSidebarSettings'
import { workspaceSidebarSettingsKeys } from '@/hooks/queryKeys'
import { type SidebarSlot, reorderWithinZones } from '@/lib/sidebarSettings'
import { toSupabaseJson } from '@/utils/supabaseJson'

type PinnedSlotType = 'board' | 'list'

export function usePinnedSlots(
  workspaceId: string | undefined,
  slotType: PinnedSlotType,
) {
  const queryClient = useQueryClient()
  const { data: settings } = useWorkspaceSidebarSettings(workspaceId)

  const slots: SidebarSlot[] = useMemo(() => settings?.slots ?? [], [settings])

  const idFromSlot = useCallback(
    (id: string): string | null => {
      const prefix = `${slotType}:`
      return id.startsWith(prefix) ? id.slice(prefix.length) : null
    },
    [slotType],
  )

  const pinnedIds = useMemo(() => {
    return slots
      .filter((s) => s.type === slotType)
      .sort((a, b) => a.order - b.order)
      .map((s) => idFromSlot(s.id))
      .filter((id): id is string => Boolean(id))
  }, [slots, slotType, idFromSlot])

  const qk = workspaceId
    ? workspaceSidebarSettingsKeys.byWorkspace(workspaceId)
    : (['workspace-sidebar-settings', 'noop'] as const)

  const buildNext = useCallback(
    (entityId: string, current: SidebarSlot[]): SidebarSlot[] => {
      const slotId = `${slotType}:${entityId}`
      const exists = current.some((s) => s.id === slotId)
      if (exists) {
        return reorderWithinZones(current.filter((s) => s.id !== slotId))
      }
      // Закрепляем в конец зоны «список».
      const listMax = current
        .filter((s) => s.placement === 'list')
        .reduce((m, s) => Math.max(m, s.order), -1)
      return reorderWithinZones([
        ...current,
        {
          id: slotId,
          type: slotType,
          placement: 'list',
          order: listMax + 1,
          badge_mode: 'disabled',
        },
      ])
    },
    [slotType],
  )

  const toggleMutation = useMutation({
    mutationFn: async (entityId: string) => {
      if (!workspaceId) return
      const next = buildNext(entityId, slots)
      const { error } = await supabase
        .from('workspace_sidebar_settings')
        .upsert(
          {
            workspace_id: workspaceId,
            slots: toSupabaseJson(next),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
      if (error) throw error as Error
    },
    onMutate: async (entityId) => {
      if (!workspaceId) return
      await queryClient.cancelQueries({ queryKey: qk })
      const prev = queryClient.getQueryData(qk)
      queryClient.setQueryData(qk, (old: unknown) => {
        const prevSettings = (old ?? { slots: [], exists: false }) as {
          slots: SidebarSlot[]
          exists: boolean
        }
        return { ...prevSettings, slots: buildNext(entityId, prevSettings.slots ?? []) }
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
    (entityId: string) => toggleMutation.mutate(entityId),
    [toggleMutation],
  )

  const isPinned = useCallback(
    (entityId: string) => pinnedIds.includes(entityId),
    [pinnedIds],
  )

  return { pinnedIds, togglePin, isPinned }
}
