"use client"

/**
 * Кэширующий хук для получения текущего участника проекта/воркспейса.
 * Заменяет прямые вызовы getCurrentProjectParticipant/getCurrentWorkspaceParticipant,
 * которые раньше делались без кэширования в каждом хуке отдельно.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { participantKeys, STALE_TIME, GC_TIME } from '@/hooks/queryKeys'
import {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
} from '@/services/api/messenger/messengerParticipantService'

export function useCurrentProjectParticipant(projectId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: participantKeys.projectParticipant(projectId ?? '', user?.id ?? ''),
    queryFn: () => getCurrentProjectParticipant(projectId!, user!.id),
    enabled: !!projectId && !!user?.id,
    staleTime: STALE_TIME.LONG, // 5 минут — participant не меняется часто
    gcTime: GC_TIME.LONG,
  })
}

export function useCurrentWorkspaceParticipant(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: participantKeys.workspaceParticipant(workspaceId, user?.id ?? ''),
    queryFn: () => getCurrentWorkspaceParticipant(workspaceId, user!.id),
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.LONG,
  })
}
