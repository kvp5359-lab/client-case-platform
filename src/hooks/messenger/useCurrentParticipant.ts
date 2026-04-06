"use client"

/**
 * Кэширующий хук для получения текущего участника проекта/воркспейса.
 * Заменяет прямые вызовы getCurrentProjectParticipant/getCurrentWorkspaceParticipant,
 * которые раньше делались без кэширования в каждом хуке отдельно.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { participantKeys } from '@/hooks/queryKeys'
import {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
} from '@/services/api/messengerParticipantService'

export function useCurrentProjectParticipant(projectId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: participantKeys.projectParticipant(projectId ?? '', user?.id ?? ''),
    queryFn: () => getCurrentProjectParticipant(projectId!, user!.id),
    enabled: !!projectId && !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 минут — participant не меняется часто
    gcTime: 10 * 60 * 1000,
  })
}

export function useCurrentWorkspaceParticipant(workspaceId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: participantKeys.workspaceParticipant(workspaceId, user?.id ?? ''),
    queryFn: () => getCurrentWorkspaceParticipant(workspaceId, user!.id),
    enabled: !!workspaceId && !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}
