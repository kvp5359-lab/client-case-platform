"use client"

import { useQuery } from '@tanstack/react-query'
import { getPersonalDialogs, type PersonalDialogEntry } from '@/services/api/personalDialogsService'
import { personalDialogsKeys, STALE_TIME } from '@/hooks/queryKeys'

export function usePersonalDialogs(
  workspaceId: string | undefined,
  targetUserId: string | undefined,
) {
  return useQuery<PersonalDialogEntry[]>({
    queryKey: personalDialogsKeys.forUser(workspaceId ?? '', targetUserId ?? ''),
    queryFn: () => getPersonalDialogs(workspaceId!, targetUserId!),
    enabled: !!workspaceId && !!targetUserId,
    staleTime: STALE_TIME.STANDARD,
  })
}
