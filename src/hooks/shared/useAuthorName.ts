"use client"

import { useQuery } from '@tanstack/react-query'
import { getParticipantName } from '@/services/api/participantService'
import { participantKeys } from '@/hooks/queryKeys'

/**
 * Хук для загрузки имени автора (участника) по userId.
 * Используется в DocumentRow, SlotRow и других компонентах,
 * где нужно показать кто загрузил файл.
 */
export function useAuthorName(userId: string | null | undefined): string | null {
  const { data: authorName = null } = useQuery({
    queryKey: participantKeys.authorName(userId ?? ''),
    queryFn: () => getParticipantName(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })

  return authorName
}
