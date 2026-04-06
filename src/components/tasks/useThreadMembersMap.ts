"use client"

/**
 * Batch-загрузка участников (members) для массива задач/тредов.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildParticipantMap } from '@/utils/format/buildParticipantMap'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

export function useThreadMembersMap(threadIds: string[]) {
  return useQuery({
    queryKey: ['thread-members-map', [...threadIds].sort().join(',')],
    queryFn: async () => {
      if (threadIds.length === 0) return {} as Record<string, AvatarParticipant[]>

      const { data, error } = await supabase
        .from('project_thread_members')
        .select('thread_id, participants!inner(id, name, last_name, avatar_url)')
        .in('thread_id', threadIds)

      if (error) throw error

      return buildParticipantMap(data ?? [])
    },
    enabled: threadIds.length > 0,
    staleTime: 30_000,
  })
}
