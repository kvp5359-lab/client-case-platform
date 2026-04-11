/**
 * Хук для управления жизненным циклом AI-диалогов проекта:
 * создание, переименование, удаление, сохранение сообщений.
 *
 * setAiMessages, setSources, startNewChat передаются через ref,
 * т.к. они возвращаются из useMessengerAi, который вызывается
 * после этого хука (circular dependency).
 */

import { useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AiMessage } from '@/store/sidePanelStore'
import {
  getConversations,
  createConversation,
  addMessage,
  getKnowledgeMessages as getConversationMessages,
  type KnowledgeConversation,
  type ConversationSources,
  type SearchSource,
} from '@/services/api/knowledge/knowledgeSearchService'
import { knowledgeBaseKeys, STALE_TIME } from '@/hooks/queryKeys'

interface UseProjectAiConversationsOptions {
  workspaceId: string
  projectId?: string
  conversationType: 'project' | 'knowledge'
  userId?: string
  sourcesRef: React.MutableRefObject<ConversationSources>
  setActiveConversationId: (id: string | null) => void
  conversationIdRef: React.MutableRefObject<string | null>
}

export function useProjectAiConversations({
  workspaceId,
  projectId,
  conversationType,
  userId,
  sourcesRef,
  setActiveConversationId,
  conversationIdRef,
}: UseProjectAiConversationsOptions) {
  const queryClient = useQueryClient()

  // Ref-обёртки для функций из useMessengerAi (заполняются в компоненте после вызова useMessengerAi)
  const setAiMessagesRef = useRef<(msgs: AiMessage[]) => void>(() => {})
  const setSourcesRef = useRef<(sources: ConversationSources) => void>(() => {})
  const startNewChatRef = useRef<() => void>(() => {})

  // Список диалогов
  const conversationsKey = [
    ...knowledgeBaseKeys.conversations(workspaceId, projectId),
    conversationType,
  ]
  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: conversationsKey,
    queryFn: () => getConversations(workspaceId, projectId, conversationType),
    enabled: !!workspaceId,
    staleTime: STALE_TIME.SHORT,
  })

  // Callback при завершении ответа AI — сохраняем в БД
  const handleAnswerComplete = useCallback(
    async (question: string, answer: string, sourceTags?: string[]) => {
      if (!userId) return

      let convId = conversationIdRef.current

      // Создаём диалог если нет
      if (!convId) {
        const conv = await createConversation({
          workspace_id: workspaceId,
          ...(projectId ? { project_id: projectId } : {}),
          user_id: userId,
          title: question.slice(0, 100),
          type: conversationType,
          sources: sourcesRef.current,
        })
        convId = conv.id
        setActiveConversationId(convId)
        queryClient.invalidateQueries({ queryKey: conversationsKey })
      }

      // Сохраняем оба сообщения (sourceTags — в поле sources user-сообщения)
      const userSources = sourceTags?.length
        ? (sourceTags.map((tag) => ({ tag })) as unknown as SearchSource[])
        : undefined
      await addMessage({
        conversation_id: convId,
        role: 'user',
        content: question,
        sources: userSources,
      })
      await addMessage({ conversation_id: convId, role: 'assistant', content: answer })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceId, projectId, userId],
  )

  // Выбор существующего диалога
  const handleSelectConversation = useCallback(
    async (conv: KnowledgeConversation) => {
      const msgs = await getConversationMessages(conv.id)
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
        return { id: m.id, role: m.role, content: m.content, sourceTags, created_at: m.created_at }
      })
      setAiMessagesRef.current(mapped)
      setActiveConversationId(conv.id)
      if (conv.sources) {
        setSourcesRef.current(conv.sources)
      }
    },
    [setActiveConversationId],
  )

  // Новый диалог
  const handleNewConversation = useCallback(() => {
    startNewChatRef.current()
    setActiveConversationId(null)
  }, [setActiveConversationId])

  // Удаление диалога
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const { supabase } = await import('@/lib/supabase')
      await supabase.from('knowledge_conversations').delete().eq('id', id)
      queryClient.invalidateQueries({ queryKey: conversationsKey })
      if (conversationIdRef.current === id) {
        handleNewConversation()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, handleNewConversation],
  )

  // Переименование
  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const { supabase } = await import('@/lib/supabase')
      await supabase.from('knowledge_conversations').update({ title }).eq('id', id)
      queryClient.invalidateQueries({ queryKey: conversationsKey })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  )

  return {
    conversations,
    loadingConversations,
    conversationsKey,
    handleAnswerComplete,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
    handleRenameConversation,
    // Ref-обёртки — заполняются в компоненте
    setAiMessagesRef,
    setSourcesRef,
    startNewChatRef,
  }
}
