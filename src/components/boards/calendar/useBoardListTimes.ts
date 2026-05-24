/**
 * Подгрузка start_at/end_at для набора тредов — для календарного вида.
 * Отдельный запрос, чтобы не менять get_workspace_threads. Чанки по 40,
 * чтобы GET-URL не упирался в лимит PostgREST.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calendarKeys } from '@/hooks/queryKeys'

export type ThreadTimes = Record<string, { start_at: string; end_at: string }>

export function useBoardListTimes(workspaceId: string, taskIds: string[]) {
  const idsKey = useMemo(() => taskIds.join(','), [taskIds])

  return useQuery({
    queryKey: [...calendarKeys.all, 'board-list-times', workspaceId, idsKey],
    enabled: taskIds.length > 0,
    queryFn: async (): Promise<ThreadTimes> => {
      const chunks: string[][] = []
      for (let i = 0; i < taskIds.length; i += 40) chunks.push(taskIds.slice(i, i + 40))

      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from('project_threads')
            .select('id, start_at, end_at')
            .in('id', chunk)
            .not('start_at', 'is', null)
            .not('end_at', 'is', null),
        ),
      )

      const map: ThreadTimes = {}
      for (const { data, error } of results) {
        if (error) throw error
        for (const row of data ?? []) {
          if (row.start_at && row.end_at) {
            map[row.id] = { start_at: row.start_at, end_at: row.end_at }
          }
        }
      }
      return map
    },
  })
}
