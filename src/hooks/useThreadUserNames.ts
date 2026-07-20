/**
 * Личные имена тредов: каждый пользователь может назвать тред по-своему
 * (видит только он). Показ везде: `личное_имя ?? общее_имя`.
 *
 * Данные — свои (RLS `thread_user_names` отдаёт только строки текущего юзера),
 * поэтому грузим один плоский список и накладываем на любой рендер имени треда
 * через `useThreadNameResolver`. Для прямых 1:1 двух сотрудников личное имя
 * автозасевается именем собеседника на стороне приёма (edge ensurePairThread).
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export const threadUserNameKeys = {
  mine: (userId: string | undefined) => ['thread-user-names', userId ?? 'anon'] as const,
}

/** Карта thread_id → моё личное имя. */
export function useMyThreadNames() {
  const { user } = useAuth()
  return useQuery({
    queryKey: threadUserNameKeys.mine(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('thread_user_names')
        .select('thread_id, name')
      if (error) throw error
      const map = new Map<string, string>()
      for (const r of data ?? []) map.set(r.thread_id as string, r.name as string)
      return map
    },
  })
}

/**
 * Резолвер имени треда: `(threadId, общееИмя) → показываемое`.
 * Единая точка — подставляется во все места, где рендерится имя треда.
 */
export function useThreadNameResolver() {
  const { data: map } = useMyThreadNames()
  return useCallback(
    (threadId: string | null | undefined, sharedName: string): string =>
      (threadId ? map?.get(threadId) : undefined) ?? sharedName,
    [map],
  )
}

/** Есть ли у меня личное имя для треда (для UI «сбросить»). */
export function useMyThreadName(threadId: string | null | undefined): string | null {
  const { data: map } = useMyThreadNames()
  return (threadId ? map?.get(threadId) : undefined) ?? null
}

/** Задать/сбросить личное имя треда (пустое/undefined → удалить). */
export function useSetThreadUserName() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, name }: { threadId: string; name: string | null }) => {
      if (!user?.id) throw new Error('not authenticated')
      const trimmed = name?.trim() ?? ''
      if (!trimmed) {
        const { error } = await supabase.from('thread_user_names')
          .delete().eq('thread_id', threadId).eq('user_id', user.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('thread_user_names')
        .upsert({ thread_id: threadId, user_id: user.id, name: trimmed, updated_at: new Date().toISOString() },
          { onConflict: 'thread_id,user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: threadUserNameKeys.mine(user?.id) }),
  })
}
