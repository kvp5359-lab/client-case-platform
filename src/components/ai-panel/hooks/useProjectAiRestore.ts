/**
 * Хук для восстановления сохранённого AI-диалога из БД:
 * загрузка сообщений и восстановление sources при открытии панели.
 */

import { useRef, useEffect, useState } from 'react'
import type { AiMessage } from '@/store/sidePanelStore'
import { logger } from '@/utils/logger'
import {
  getKnowledgeMessages as getConversationMessages,
  type KnowledgeConversation,
  type ConversationSources,
} from '@/services/api/knowledgeSearchService'

interface UseProjectAiRestoreOptions {
  activeConversationId: string | null
  aiMessages: AiMessage[]
  setAiMessages: (msgs: AiMessage[]) => void
  setActiveConversationId: (id: string | null) => void
  setSources: (sources: ConversationSources) => void
  conversations: KnowledgeConversation[]
}

export function useProjectAiRestore({
  activeConversationId,
  aiMessages,
  setAiMessages,
  setActiveConversationId,
  setSources,
  conversations,
}: UseProjectAiRestoreOptions) {
  // Автозагрузка сообщений при восстановлении сохранённого диалога
  const [restoringConversation, setRestoringConversation] = useState(false)
  const restoreAttemptedRef = useRef(false)
  useEffect(() => {
    const convId = activeConversationId
    if (!convId || aiMessages.length > 0 || restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true

    setRestoringConversation(true)

    getConversationMessages(convId)
      .then((msgs) => {
        if (msgs.length === 0) return
        const mapped: AiMessage[] = msgs.map((m) => {
          let sourceTags: string[] | undefined
          if (m.role === 'user' && m.sources && Array.isArray(m.sources)) {
            const tags = (m.sources as unknown[])
              .filter(
                (s): s is { tag: string } =>
                  typeof s === 'object' &&
                  s !== null &&
                  'tag' in s &&
                  typeof (s as { tag?: unknown }).tag === 'string',
              )
              .map((s) => s.tag)
            if (tags.length > 0) sourceTags = tags
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            sourceTags,
            created_at: m.created_at,
          }
        })
        setAiMessages(mapped)
      })
      .catch((err) => {
        logger.warn('Не удалось восстановить AI-диалог:', err)
        setActiveConversationId(null)
      })
      .finally(() => {
        setRestoringConversation(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Восстанавливаем sources из диалога после загрузки списка conversations
  const sourcesRestoredRef = useRef(false)
  useEffect(() => {
    if (sourcesRestoredRef.current || !activeConversationId || conversations.length === 0) return
    const conv = conversations.find((c) => c.id === activeConversationId)
    if (conv?.sources) {
      sourcesRestoredRef.current = true
      setSources(conv.sources)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, activeConversationId])

  return { restoringConversation }
}
