"use client"

/**
 * Возвращает карту project_id → [participant_id] для всех проектов workspace.
 * Используется движком фильтров на доске для junction-фильтра `participants`
 * ({@link useFilteredProjects}).
 *
 * Выгружается одним запросом в `project_participants`. Отдельный хук, потому
 * что существующие `useProjectParticipantsData` и `messengerParticipantService`
 * работают в разрезе одного проекта/чата и не подходят.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { boardParticipantKeys, STALE_TIME } from '@/hooks/queryKeys'

export function useWorkspaceProjectParticipants(
  workspaceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: boardParticipantKeys.byWorkspace(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select('project_id, participant_id, projects!inner(workspace_id, is_deleted)')
        .eq('projects.workspace_id', workspaceId!)
        .eq('projects.is_deleted', false)

      if (error) throw error

      const map: Record<string, { id: string }[]> = {}
      for (const row of data ?? []) {
        const pid = row.project_id
        if (!map[pid]) map[pid] = []
        map[pid].push({ id: row.participant_id })
      }
      return map
    },
    enabled: !!workspaceId && enabled,
    staleTime: STALE_TIME.MEDIUM,
  })
}
