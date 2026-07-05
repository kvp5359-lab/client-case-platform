"use client"

/**
 * AI assistant hook for project messenger.
 * Manages private AI dialog with support for three sources:
 * messages, form data, documents.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { streamMessengerAiChat, buildProjectContext } from '@/services/api/messenger/messengerAiService'
import type { AiSources } from '@/services/api/messenger/messengerAiService'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { useFormKitsForAi } from './useFormKitsForAi'
import { useDocumentsForAi } from './useDocumentsForAi'
import { useAiSources } from './useAiSources'
import { useProjectContextItems } from '@/hooks/projects/useProjectContext'
import { projectContextItemsToAi } from '@/services/api/projectContext/projectContextForAi'

import type { AiMessage } from '@/store/sidePanelStore'
export type { AiMessage }

// Re-export for consumers
export { fetchDocumentsForAi } from './useDocumentsForAi'

export type AttachedDocument = {
  id: string
  name: string
  textContent?: string | null
  isUploadedFile?: boolean
  file?: File
}

const MAX_CONVERSATION_HISTORY = 20
const MAX_DOC_LENGTH = 30_000

export type UseMessengerAiOptions = {
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
  const {
    sources,
    setSources,
    toggleSource,
    setKnowledge,
    setChatScope,
    setProjectContextScope,
    disableAllSources,
  } = useAiSources({
    initialSources: options?.initialSources,
    onSourcesChange: options?.onSourcesChange,
  })

  // Data queries
  const { data: formKits } = useFormKitsForAi(projectId)
  const { data: documents } = useDocumentsForAi(projectId)
  const { data: projectContextRaw } = useProjectContextItems(projectId)
  const projectContextItems = projectContextItemsToAi(projectContextRaw)

  const formKitCount = formKits?.length ?? 0
  const documentCount = documents?.length ?? 0
  // Общее число записей в модуле (для бейджа), независимо от того,
  // у каких есть extracted_text. AI использует только записи с текстом.
  const projectContextCount = projectContextRaw?.length ?? 0
  // Опции для picker'а — полный список с флагом hasText
  const projectContextOptions = (projectContextRaw ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    itemType: r.item_type as 'text' | 'file' | 'screenshot',
    hasText:
      r.item_type === 'text'
        ? !!(r.content_html && r.content_html.trim())
        : !!(r.extracted_text && r.extracted_text.trim()),
  }))
  // Сколько записей с текстом уйдёт в AI при текущем scope
  const projectContextEffectiveCount = (() => {
    const scope = sources.projectContext
    const items = projectContextItems
    if (scope.mode === 'all') return items.length
    if (scope.itemIds.length === 0) return 0
    return items.filter((i) => scope.itemIds.includes(i.id)).length
  })()

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
      const projectContextActive =
        sources.projectContext.mode === 'all' ||
        (sources.projectContext.mode === 'selected' &&
          sources.projectContext.itemIds.length > 0)

      if (
        !hasAttachments &&
        !hasSessionDocs &&
        !hasHistory &&
        !chatsActive &&
        !sources.formData &&
        !sources.documents &&
        !projectContextActive &&
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
      if (projectContextActive) {
        activeSources.push(
          sources.projectContext.mode === 'all'
            ? 'Заметки: все'
            : `Заметки: ${sources.projectContext.itemIds.length} выбрано`,
        )
      }
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
          projectContextItems,
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
      projectContextItems,
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
    projectContextCount,
    projectContextEffectiveCount,
    projectContextOptions,
    setProjectContextScope,
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
