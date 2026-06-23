"use client"

/**
 * Для списка задач ПРОЕКТА (он читает project_threads напрямую, без RPC
 * get_workspace_threads, где есть email_unsent) — определяет, какие из
 * переданных email-тредов ещё не отправлены (нет НЕ-черновых сообщений).
 *
 * Возвращает Set id «неотправленных» (= черновик письма). Лёгкий запрос:
 * фильтр по небольшому списку email-тредов проекта.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { STALE_TIME } from '@/hooks/queryKeys'

export function useUnsentEmailThreads(emailThreadIds: string[]): Set<string> {
  const sorted = [...emailThreadIds].sort()
  const { data } = useQuery({
    queryKey: ['unsent-email-threads', sorted],
    enabled: sorted.length > 0,
    staleTime: STALE_TIME.SHORT,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_messages')
        .select('thread_id')
        .in('thread_id', sorted)
        .eq('is_draft', false)
      if (error) throw error
      const sent = new Set((data ?? []).map((r) => r.thread_id as string))
      return sorted.filter((id) => !sent.has(id))
    },
  })
  return new Set(data ?? [])
}
