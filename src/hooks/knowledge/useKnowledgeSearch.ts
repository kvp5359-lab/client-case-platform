"use client"

/**
 * Хук для AI-поиска по базе знаний.
 * Управляет отправкой вопросов, стримингом ответов, сохранением в диалог и историей.
 *
 * Поддерживает два режима:
 * - «quick» — вопрос → сразу стриминг ответа (как раньше)
 * - «selective» — вопрос → список источников с чекбоксами → генерация из выбранных
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  streamKnowledgeSearch,
  searchKnowledgeSources,
  createConversation,
  addMessage,
  type KnowledgeMessage,
  type KnowledgeConversation,
  type SearchSource,
  type ArticleSource,
} from '@/services/api/knowledge/knowledgeSearchService'
import { knowledgeBaseKeys } from '../queryKeys'
import { logger } from '@/utils/logger'

export type SearchMode = 'quick' | 'selective'

interface UseKnowledgeSearchOptions {
  workspaceId: string
  projectId?: string
  templateId?: string
}

export function useKnowledgeSearch({
  workspaceId,
  projectId,
  templateId,
}: UseKnowledgeSearchOptions) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<KnowledgeMessage[]>([])

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)

  // Source selection state (selective mode)
  const [searchMode, setSearchMode] = useState<SearchMode>('quick')
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [foundSources, setFoundSources] = useState<ArticleSource[] | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())

  // Refs for synchronous access (prevent stale closures)
  const conversationIdRef = useRef<string | null>(null)
  const messagesRef = useRef<KnowledgeMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // --- Phase 1: search sources only (selective mode) ---
  const searchSourcesMutation = useMutation({
    mutationFn: async (question: string) => {
      const result = await searchKnowledgeSources({
        question,
        workspace_id: workspaceId,
        template_id: templateId,
      })
      return { question, result }
    },
    onSuccess: ({ question, result }) => {
      if (result.sources.length === 0) {
        // No sources found — show as bot message
        const noResultMsg: KnowledgeMessage = {
          id: `temp-no-result-${Date.now()}`,
          conversation_id: conversationIdRef.current ?? '',
          role: 'assistant',
          content:
            'По вашему запросу ничего не найдено в базе знаний. Попробуйте переформулировать вопрос.',
          sources: null,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-user-${Date.now()}`,
            conversation_id: conversationIdRef.current ?? '',
            role: 'user',
            content: question,
            sources: null,
            created_at: new Date().toISOString(),
          },
          noResultMsg,
        ])
        return
      }
      setPendingQuestion(question)
      setFoundSources(result.sources)
      // Select all by default — use article_id or qa_id as universal ID
      setSelectedSourceIds(new Set(result.sources.map((s) => s.article_id ?? s.qa_id ?? '')))
    },
  })

  // --- Phase 2: generate answer (both modes) ---
  const askMutation = useMutation({
    mutationFn: async ({
      question,
      articleIds,
      qaIds,
    }: {
      question: string
      articleIds?: string[]
      qaIds?: string[]
    }) => {
      if (!user) throw new Error('Not authenticated')

      // Abort previous stream if any
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      // Ensure conversation exists
      let conversationId = conversationIdRef.current
      if (!conversationId) {
        const conversation = await createConversation({
          workspace_id: workspaceId,
          project_id: projectId,
          user_id: user.id,
          title: question.slice(0, 100),
        })
        conversationId = conversation.id
        conversationIdRef.current = conversationId
        setActiveConversationId(conversationId)
        queryClient.invalidateQueries({
          queryKey: knowledgeBaseKeys.conversations(workspaceId, projectId),
        })
      }

      // Optimistic user message (show immediately)
      const optimisticUserMsg: KnowledgeMessage = {
        id: `temp-user-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content: question,
        sources: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimisticUserMsg])

      // Build conversation history before adding optimistic message
      const history = messagesRef.current.map((m) => ({ role: m.role, content: m.content }))

      // Save user message in parallel with streaming search
      const saveUserPromise = addMessage({
        conversation_id: conversationId,
        role: 'user',
        content: question,
      }).then((savedMsg) => {
        setMessages((prev) => prev.map((m) => (m.id === optimisticUserMsg.id ? savedMsg : m)))
      })

      // Start streaming
      setIsStreaming(true)
      setStreamingContent('')

      let fullAnswer = ''
      let sources: SearchSource[] = []

      await streamKnowledgeSearch(
        {
          question,
          workspace_id: workspaceId,
          template_id: templateId,
          conversation_history: history,
          selected_article_ids: articleIds,
          selected_qa_ids: qaIds,
        },
        {
          onSources: (s) => {
            sources = s
          },
          onText: (chunk) => {
            fullAnswer += chunk
            // Strip USED_SOURCES meta tag and truncate at any incomplete HTML comment
            let display = fullAnswer.replace(/<!-- USED_SOURCES:\s*\[[^\]]*\]\s*-->/g, '')
            const incompleteTagStart = display.indexOf('<!-- ')
            if (incompleteTagStart !== -1) {
              display = display.slice(0, incompleteTagStart)
            }
            setStreamingContent(display.trim())
          },
          onDone: (answer) => {
            // Server already strips USED_SOURCES from answer in done event
            fullAnswer = answer
          },
          onError: (error) => {
            throw new Error(error)
          },
        },
        abortRef.current.signal,
      )

      // Wait for user message save
      await saveUserPromise

      // Stream finished — clear streaming state
      setIsStreaming(false)
      setStreamingContent(null)

      // Add final assistant message to UI immediately
      const localAssistantMsg: KnowledgeMessage = {
        id: `temp-assistant-${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: fullAnswer,
        sources,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, localAssistantMsg])

      // Fire-and-forget: save assistant message to DB
      addMessage({
        conversation_id: conversationId,
        role: 'assistant',
        content: fullAnswer,
        sources,
      })
        .then((savedMsg) => {
          setMessages((prev) => prev.map((m) => (m.id === localAssistantMsg.id ? savedMsg : m)))
        })
        .catch((err) => {
          logger.error('Failed to save assistant message:', err)
        })

      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.conversations(workspaceId, projectId),
      })

      return { answer: fullAnswer, sources, chunks_used: sources.length }
    },
  })

  // --- Unified ask ---
  const ask = useCallback(
    (question: string) => {
      if (searchMode === 'selective') {
        searchSourcesMutation.mutate(question)
      } else {
        askMutation.mutate({ question })
      }
    },
    [searchMode, searchSourcesMutation, askMutation],
  )

  // --- Source selection helpers ---
  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) {
        next.delete(sourceId)
      } else {
        next.add(sourceId)
      }
      return next
    })
  }, [])

  const generateFromSelected = useCallback(() => {
    if (!pendingQuestion || selectedSourceIds.size === 0 || !foundSources) return
    const question = pendingQuestion

    // Split selected IDs into article_ids and qa_ids based on source type
    const articleIds: string[] = []
    const qaIds: string[] = []
    for (const source of foundSources) {
      const id = source.article_id ?? source.qa_id ?? ''
      if (!selectedSourceIds.has(id)) continue
      if (source.source_type === 'qa' && source.qa_id) {
        qaIds.push(source.qa_id)
      } else if (source.article_id) {
        articleIds.push(source.article_id)
      }
    }

    // Clear source selection state
    setPendingQuestion(null)
    setFoundSources(null)
    setSelectedSourceIds(new Set())
    // Start generation
    askMutation.mutate({
      question,
      articleIds: articleIds.length > 0 ? articleIds : undefined,
      qaIds: qaIds.length > 0 ? qaIds : undefined,
    })
  }, [pendingQuestion, selectedSourceIds, foundSources, askMutation])

  const dismissSources = useCallback(() => {
    setPendingQuestion(null)
    setFoundSources(null)
    setSelectedSourceIds(new Set())
  }, [])

  const loadConversation = useCallback(
    (conversation: KnowledgeConversation, loadedMessages: KnowledgeMessage[]) => {
      conversationIdRef.current = conversation.id
      setActiveConversationId(conversation.id)
      setMessages(loadedMessages)
      // Clear any pending source selection
      setPendingQuestion(null)
      setFoundSources(null)
      setSelectedSourceIds(new Set())
    },
    [],
  )

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort()
    conversationIdRef.current = null
    setActiveConversationId(null)
    setMessages([])
    setIsStreaming(false)
    setStreamingContent(null)
    setPendingQuestion(null)
    setFoundSources(null)
    setSelectedSourceIds(new Set())
  }, [])

  return {
    // Existing
    messages,
    activeConversationId,
    isSearching: askMutation.isPending || searchSourcesMutation.isPending,
    isStreaming,
    streamingContent,
    error: askMutation.error || searchSourcesMutation.error,
    ask,
    loadConversation,
    startNewConversation,
    // Source selection
    searchMode,
    setSearchMode,
    foundSources,
    selectedSourceIds,
    isSearchingSources: searchSourcesMutation.isPending,
    toggleSource,
    generateFromSelected,
    dismissSources,
  }
}
