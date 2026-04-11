"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { currentParticipantKeys, STALE_TIME } from '@/hooks/queryKeys'

/**
 * Возвращает participant_id текущего пользователя в указанном workspace.
 */
export function useCurrentParticipantId(workspaceId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: currentParticipantKeys.forUser(workspaceId ?? '', user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from('participants')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user!.id)
        .eq('is_deleted', false)
        .maybeSingle()
      return data?.id ?? null
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.LONG,
  })
}
