"use client"

/**
 * Хук для загрузки сообщений конкретного диалога
 */

import { useQuery } from '@tanstack/react-query'
import { getKnowledgeMessages } from '@/services/api/knowledgeSearchService'
import { knowledgeBaseKeys } from '../queryKeys'

export function useKnowledgeMessages(conversationId: string | null) {
  return useQuery({
    queryKey: knowledgeBaseKeys.messages(conversationId ?? ''),
    queryFn: () => getKnowledgeMessages(conversationId!),
    enabled: !!conversationId,
  })
}
