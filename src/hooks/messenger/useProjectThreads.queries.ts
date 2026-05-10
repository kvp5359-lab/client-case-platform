"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  messengerKeys,
  projectThreadKeys,
  STALE_TIME,
} from '@/hooks/queryKeys'
import type { MessageChannel } from '@/services/api/messenger/messengerService'
import type { ProjectThread } from './useProjectThreads.types'

/**
 * Загрузить все треды проекта
 */
export function useProjectThreads(projectId: string | undefined) {
  return useQuery({
    queryKey: messengerKeys.projectThreads(projectId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('*')
        .eq('project_id', projectId!)
        .eq('is_deleted', false)
        .order('is_pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) throw error
      return data as ProjectThread[]
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/**
 * Загрузить один тред по id. Используется там, где нужен полный ProjectThread,
 * а в руках есть только облегчённая форма (например, TaskItem в TaskPanel
 * перед открытием ChatSettingsDialog).
 */
export function useProjectThreadById(threadId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: projectThreadKeys.byId(threadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('*')
        .eq('id', threadId!)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      return (data as ProjectThread | null) ?? null
    },
    enabled: enabled && !!threadId,
    staleTime: STALE_TIME.SHORT,
  })
}

/**
 * Получить threadId по legacy_channel из кэша project_threads
 */
export function useThreadIdByChannel(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
): string | undefined {
  const { data: threads } = useProjectThreads(projectId)
  return threads?.find((c) => c.legacy_channel === channel)?.id
}
