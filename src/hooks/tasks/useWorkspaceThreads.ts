"use client"

/**
 * useWorkspaceThreads — загрузка тредов workspace (задачи + чаты).
 * Возвращает только треды, к которым у текущего пользователя есть доступ.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceThreadKeys, STALE_TIME } from '@/hooks/queryKeys'

// WorkspaceTask переехал в нейтральный @/types/board (T1) — реэкспорт для
// существующих импортёров хука.
export type { WorkspaceTask } from '@/types/board'
import type { WorkspaceTask } from '@/types/board'

export function useWorkspaceThreads(workspaceId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: workspaceThreadKeys.forUser(workspaceId ?? '', user?.id),
    queryFn: async () => {
      // PostgREST отдаёт максимум 1000 строк за запрос. Воркспейсы с >1000
      // тредов раньше теряли всё сверх лимита (треды просто не доходили до
      // досок/списков). Грузим постранично, пока приходит полная страница.
      const PAGE = 1000
      const all: WorkspaceTask[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .rpc('get_workspace_threads', {
            p_workspace_id: workspaceId!,
            p_user_id: user!.id,
          })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as WorkspaceTask[]
        all.push(...batch)
        if (batch.length < PAGE) break
      }
      return all
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.SHORT,
  })
}
