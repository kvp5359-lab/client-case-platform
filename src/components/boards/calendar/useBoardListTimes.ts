/**
 * Подгрузка start_at/end_at для набора тредов — для календарного вида.
 * Отдельный запрос, чтобы не менять get_workspace_threads.
 *
 * ⚠️ Только RPC с массивом id (POST), НЕ `.in('id', chunk)` GET-чанками:
 * чанки по 40 на списке «Календарь» (~2000 тредов) давали ~50 параллельных
 * запросов на каждый маунт доски (аудит 2026-07-23, суммарно ~13с сетевого
 * времени). RPC — один запрос без лимита URL, RLS та же (SECURITY INVOKER).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calendarKeys } from '@/hooks/queryKeys'
import { hashIdList } from '@/lib/hashIdList'

export type ThreadTimes = Record<string, { start_at: string; end_at: string }>

export function useBoardListTimes(workspaceId: string, taskIds: string[]) {
  // Хеш вместо join 2000 UUID: ключ кэша был строкой ~74 КБ (аудит №12).
  const idsKey = useMemo(() => hashIdList(taskIds), [taskIds])

  return useQuery({
    queryKey: [...calendarKeys.all, 'board-list-times', workspaceId, idsKey],
    enabled: taskIds.length > 0,
    queryFn: async (): Promise<ThreadTimes> => {
      const { data, error } = await supabase.rpc('get_thread_times_for_threads', {
        p_thread_ids: taskIds,
      })
      if (error) throw error

      const map: ThreadTimes = {}
      for (const row of data ?? []) {
        if (row.start_at && row.end_at) {
          map[row.id] = { start_at: row.start_at, end_at: row.end_at }
        }
      }
      return map
    },
  })
}
