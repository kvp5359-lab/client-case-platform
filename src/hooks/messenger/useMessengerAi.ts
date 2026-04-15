"use client"

/**
 * AI assistant hook for project messenger.
 * Manages private AI dialog with support for three sources:
 * messages, form data, documents.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { streamMessengerAiChat, buildProjectContext } from '@/services/api/messenger/messengerAiService'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { useFormKitsForAi } from './useFormKitsForAi'
import { useDocumentsForAi } from './useDocumentsForAi'
import { useAiSources } from './useAiSources'
import type { AiSources } from '@/services/api/messenger/messengerAiService'

import type { AiMessage } from '@/store/sidePanelStore'
export type { AiMessage }

// Re-export for consumers
export { fetchDocumentsForAi } from './useDocumentsForAi'

export interface AttachedDocument {
  id: string
  name: string
  textContent?: string | null
  isUploadedFile?: boolean
  file?: File
}

const MAX_CONVERSATION_HISTORY = 20
const MAX_DOC_LENGTH = 30_000

export interface UseMessengerAiOptions {
  onAnswerComplete?: (question: string, answer: string, sourceTags?: string[]) => void
  templateId?: string
  initialSources?: AiSources
  initialAiMessages?: AiMessage[]
  initialSessionDocs?: Record<string, { name: string; text: string }>
  onSourcesChange?: (sources: AiSources) => void
  onAiMessagesChange?: (messages: AiMessage[]) => void
  onSessionDocsChange?: (docs: Record<string, { name: string; text: string }>) => void
}

export function useMessengerAi(
  projectId: string,
  workspaceId: string,
  chatMessages: ProjectMessage[],
  /** Человекочитаемый ярлык скоупа чатов (для заголовка контекста), напр. «Все чаты» */
  chatScopeLabel: string | undefined,
  options?: UseMessengerAiOptions,
) {
  const onAnswerCompleteRef = useRef(options?.onAnswerComplete)
  useEffect(() => {
    onAnswerCompleteRef.current = options?.onAnswerComplete
  }, [options?.onAnswerComplete])

  const onAiMessagesChangeRef = useRef(options?.onAiMessagesChange)
  useEffect(() => {
    onAiMessagesChangeRef.current = options?.onAiMessagesChange
  }, [options?.onAiMessagesChange])

  const onSessionDocsChangeRef = useRef(options?.onSessionDocsChange)
  useEffect(() => {
    onSessionDocsChangeRef.current = options?.onSessionDocsChange
  }, [options?.onSessionDocsChange])

  const templateIdRef = useRef(options?.templateId)
  useEffect(() => {
    templateIdRef.current = options?.templateId
  }, [options?.templateId])

  const [aiMessages, setAiMessagesRaw] = useState<AiMessage[]>(
    () => options?.initialAiMessages ?? [],
  )

  // Notify parent about aiMessages changes outside of render
  const isAiMsgInitialMount = useRef(true)
  useEffect(() => {
    if (isAiMsgInitialMount.current) {
      isAiMsgInitialMount.current = false
      return
    }
    onAiMessagesChangeRef.current?.(aiMessages)
  }, [aiMessages])

  const setAiMessages = useCallback((msgs: AiMessage[] | ((prev: AiMessage[]) => AiMessage[])) => {
    setAiMessagesRaw((prev) => {
      const next = typeof msgs === 'function' ? msgs(prev) : msgs
      return next
    })
  }, [])

  const [isStreaming, setIsStreamingState] = useState(false)
  const isStreamingRef = useRef(false)
  const setIsStreaming = useCallback((v: boolean) => {
    isStreamingRef.current = v
    setIsStreamingState(v)
  }, [])
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [attachedDocuments, setAttachedDocuments] = useState<AttachedDocument[]>([])
  const sessionDocsRef = useRef<Map<string, { name: string; text: string }>>(
    new Map(Object.entries(options?.initialSessionDocs ?? {})),
  )

  // Sources management
  const { sources, setSources, toggleSource, setKnowledge, setChatScope, disableAllSources } = useAiSources({
    initialSources: options?.initialSources,
    onSourcesChange: options?.onSourcesChange,
  })

  // Data queries
  const { data: formKits } = useFormKitsForAi(projectId)
  const { data: documents } = useDocumentsForAi(projectId)

  const formKitCount = formKits?.length ?? 0
  const documentCount = documents?.length ?? 0

  const addAttachedDocument = useCallback((doc: AttachedDocument) => {
    setAttachedDocuments((prev) => {
      if (prev.some((d) => d.id === doc.id)) return prev
      return [...prev, doc]
    })
  }, [])

  const removeAttachedDocument = useCallback((id: string) => {
    setAttachedDocuments((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const clearAttachedDocuments = useCallback(() => {
    setAttachedDocuments([])
  }, [])

  const ask = useCallback(
    async (question: string) => {
      if (isStreamingRef.current) return

      const hasAttachments = attachedDocuments.length > 0
      const hasSessionDocs = sessionDocsRef.current.size > 0
      const hasHistory = aiMessages.length > 0

      const chatsActive =
        sources.chats.mode === 'all' ||
        (sources.chats.mode === 'selected' && sources.chats.threadIds.length > 0)

      if (
        !hasAttachments &&
        !hasSessionDocs &&
        !hasHistory &&
        !chatsActive &&
        !sources.formData &&
        !sources.documents &&
        !sources.knowledge
      ) {
        toast.warning('Выберите хотя бы один источник данных или прикрепите документ')
        return
      }

      setError(null)
      setIsStreaming(true)
      setStreamingContent('')

      const activeSources: string[] = []
      if (chatsActive) {
        activeSources.push(
          sources.chats.mode === 'all'
            ? 'Чаты: все'
            : `Чаты: ${sources.chats.threadIds.length} выбрано`,
        )
      }
      if (sources.formData) activeSources.push('Анкеты')
      if (sources.documents) activeSources.push('Документы')
      if (sources.knowledge === 'project') activeSources.push('БЗ проекта')
      if (sources.knowledge === 'all') activeSources.push('Вся БЗ')
      for (const doc of attachedDocuments) {
        activeSources.push(`attached:${doc.name}`)
      }

      const userMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: question,
        sourceTags: activeSources,
        created_at: new Date().toISOString(),
      }
      setAiMessages((prev) => [...prev, userMsg])

      let context: string
      try {
        context = buildProjectContext({
          sources,
          chatMessages,
          chatScopeLabel,
          formKits: formKits ?? undefined,
          documents: documents ?? undefined,
        })
      } catch (err) {
        setError((err as Error).message)
        setIsStreaming(false)
        return
      }

      let sessionDocsChanged = false
      for (const doc of attachedDocuments) {
        if (!doc.isUploadedFile && doc.textContent && !sessionDocsRef.current.has(doc.id)) {
          const text =
            doc.textContent.length > MAX_DOC_LENGTH
              ? doc.textContent.slice(0, MAX_DOC_LENGTH) + '\n... (текст обрезан)'
              : doc.textContent
          sessionDocsRef.current.set(doc.id, { name: doc.name, text })
          sessionDocsChanged = true
        }
      }
      if (sessionDocsChanged) {
        onSessionDocsChangeRef.current?.(Object.fromEntries(sessionDocsRef.current))
      }

      if (sessionDocsRef.current.size > 0) {
        const parts = [...sessionDocsRef.current.values()].map(
          (d) => `--- ${d.name} ---\n${d.text}`,
        )
        context += `\n\n== ПРИКРЕПЛЁННЫЕ ДОКУМЕНТЫ (${parts.length} шт.) ==\n${parts.join('\n\n')}`
      }

      if (
        !context.trim() &&
        !hasAttachments &&
        !hasSessionDocs &&
        !hasHistory &&
        !sources.knowledge
      ) {
        toast.warning('Нет данных в выбранных источниках')
        setIsStreaming(false)
        return
      }

      const uploadedFile = attachedDocuments.find((d) => d.isUploadedFile && d.file)?.file

      const conversationHistory = aiMessages.slice(-MAX_CONVERSATION_HISTORY).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const abortController = new AbortController()
      abortRef.current = abortController

      let fullAnswer = ''

      const knowledgeParams: {
        knowledge_template_id?: string
        knowledge_all?: boolean
      } = {}
      if (sources.knowledge === 'project' && templateIdRef.current) {
        knowledgeParams.knowledge_template_id = templateIdRef.current
      } else if (sources.knowledge === 'all') {
        knowledgeParams.knowledge_all = true
      }

      try {
        await streamMessengerAiChat(
          {
            workspace_id: workspaceId,
            question,
            context: context || 'Нет дополнительного контекста проекта.',
            conversation_history: conversationHistory,
            file: uploadedFile,
            ...knowledgeParams,
          },
          {
            onText: (chunk) => {
              fullAnswer += chunk
              setStreamingContent(fullAnswer)
            },
            onDone: (answer) => {
              const assistantMsg: AiMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: answer,
                created_at: new Date().toISOString(),
              }
              setAiMessages((prev) => [...prev, assistantMsg])
              setStreamingContent(null)
              setIsStreaming(false)
              clearAttachedDocuments()
              onAnswerCompleteRef.current?.(question, answer, activeSources)
            },
            onError: (err) => {
              setError(err)
              setStreamingContent(null)
              setIsStreaming(false)
            },
          },
          abortController.signal,
        )
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Не удалось получить ответ от AI')
        }
        setStreamingContent(null)
        setIsStreaming(false)
      }
    },
    [
      workspaceId,
      chatMessages,
      chatScopeLabel,
      aiMessages,
      sources,
      formKits,
      documents,
      attachedDocuments,
      clearAttachedDocuments,
      setAiMessages,
      setIsStreaming,
    ],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setStreamingContent(null)
  }, [setIsStreaming])

  const startNewChat = useCallback(() => {
    stop()
    setAiMessages([])
    setError(null)
    sessionDocsRef.current.clear()
    onSessionDocsChangeRef.current?.({})
  }, [stop, setAiMessages])

  return {
    aiMessages,
    setAiMessages,
    isStreaming,
    streamingContent,
    error,
    sources,
    setSources,
    toggleSource,
    setKnowledge,
    setChatScope,
    disableAllSources,
    formKitCount,
    documentCount,
    ask,
    stop,
    startNewChat,
    attachedDocuments,
    addAttachedDocument,
    removeAttachedDocument,
    clearAttachedDocuments,
    projectDocuments: documents ?? [],
  }
}
