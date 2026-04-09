/**
 * AI-ассистент проекта (переписка, анкеты, документы).
 * Встраивается в боковую панель AI-ассистента как вкладка «Проект».
 * Поддерживает сохранение истории диалогов.
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useMessengerAi } from '@/hooks/messenger/useMessengerAi'
import type { AiMessage } from '@/store/sidePanelStore'
import { useDocumentStatuses } from '@/hooks/useStatuses'
import { useAuth } from '@/contexts/AuthContext'
import { DocumentPickerDialog } from '@/components/messenger/DocumentPickerDialog'
import { getMessages as getMessengerMessages } from '@/services/api/messenger/messengerService'
import { type ConversationSources } from '@/services/api/knowledge/knowledgeSearchService'
import { supabase } from '@/lib/supabase'
import { AiChatInput } from './AiChatInput'
import { AiMessageBubble } from './AiMessageBubble'
import { AiStreamingBubble } from './AiStreamingBubble'
import { ChatDateSeparator } from '@/components/shared/ChatDateSeparator'
import { ConversationTabsBar } from '@/components/shared/ConversationTabsBar'
import { ChatEmptyState } from '@/components/shared/ChatEmptyState'
import { useProjectAiConversations } from './hooks/useProjectAiConversations'
import { useProjectAiRestore } from './hooks/useProjectAiRestore'
import { useProjectAiDocuments } from './hooks/useProjectAiDocuments'
import { logger } from '@/utils/logger'

interface ProjectAiChatProps {
  projectId?: string
  workspaceId: string
  templateId?: string
  hasKnowledgeProjectAccess?: boolean
  hasKnowledgeAllAccess?: boolean
  hasTeamMessagesAccess?: boolean
}

export function ProjectAiChat({
  projectId,
  workspaceId,
  templateId,
  hasKnowledgeProjectAccess,
  hasKnowledgeAllAccess,
  hasTeamMessagesAccess,
}: ProjectAiChatProps) {
  const { user } = useAuth()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const hasProject = !!projectId
  // Ключ сессии: projectId или '__knowledge__' для режима базы знаний
  const sessionKey = projectId || '__knowledge__'
  const conversationType = hasProject ? 'project' : 'knowledge'

  // Persisted AI session state from store
  const getAiSession = useSidePanelStore((s) => s.getAiSession)
  const updateAiSession = useSidePanelStore((s) => s.updateAiSession)
  const session = getAiSession(sessionKey)

  const [activeConversationId, setActiveConversationIdLocal] = useState<string | null>(
    session.activeConversationId,
  )
  const conversationIdRef = useRef<string | null>(session.activeConversationId)

  // Sync activeConversationId to store
  const setActiveConversationId = useCallback(
    (id: string | null) => {
      setActiveConversationIdLocal(id)
      conversationIdRef.current = id
      updateAiSession(sessionKey, { activeConversationId: id })
    },
    [sessionKey, updateAiSession],
  )

  // Загрузка сообщений мессенджера для AI-контекста (два канала)
  const { data: clientMessengerData } = useQuery({
    queryKey: ['project-ai', 'messenger-messages', projectId, 'client'],
    queryFn: () => getMessengerMessages(projectId!, { limit: 200, channel: 'client' }),
    enabled: hasProject,
    staleTime: 2 * 60 * 1000,
  })
  const { data: teamMessengerData } = useQuery({
    queryKey: ['project-ai', 'messenger-messages', projectId, 'internal'],
    queryFn: () => getMessengerMessages(projectId!, { limit: 200, channel: 'internal' }),
    enabled: hasProject,
    staleTime: 2 * 60 * 1000,
  })
  const clientMessages = clientMessengerData?.messages ?? []
  const teamMessages = teamMessengerData?.messages ?? []

  // Без проекта: knowledge: 'all' по умолчанию
  const initialSources =
    !hasProject && !session.sources.knowledge
      ? { ...session.sources, knowledge: 'all' as const }
      : session.sources

  // Ref для текущих sources — используется в callbacks без stale closure
  const sourcesRef = useRef<ConversationSources>(initialSources as ConversationSources)

  // Conversation CRUD (create, rename, delete, save messages, query list)
  const {
    conversations,
    loadingConversations,
    handleAnswerComplete,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
    handleRenameConversation,
    setAiMessagesRef,
    setSourcesRef,
    startNewChatRef,
  } = useProjectAiConversations({
    workspaceId,
    projectId,
    conversationType,
    userId: user?.id,
    sourcesRef,
    setActiveConversationId,
    conversationIdRef,
  })

  const {
    aiMessages,
    setAiMessages,
    isStreaming,
    streamingContent,
    error,
    sources,
    setSources,
    toggleSource,
    setKnowledge,
    disableAllSources,
    formKitCount,
    documentCount,
    ask,
    stop,
    startNewChat,
    attachedDocuments,
    addAttachedDocument,
    removeAttachedDocument,
    projectDocuments,
  } = useMessengerAi(
    projectId || '',
    workspaceId,
    { client: clientMessages, team: teamMessages },
    {
      onAnswerComplete: handleAnswerComplete,
      templateId,
      initialSources: initialSources,
      initialAiMessages: session.aiMessages,
      initialSessionDocs: session.sessionDocs,
      onSourcesChange: useCallback(
        (s: import('@/services/api/messenger/messengerAiService').AiSources) => {
          sourcesRef.current = s as ConversationSources
          updateAiSession(sessionKey, { sources: s })
          // Сохраняем sources в БД (fire-and-forget, не кидаем ошибку — у клиентов нет RLS-доступа)
          const convId = conversationIdRef.current
          if (convId) {
            supabase
              .from('knowledge_conversations')
              .update({ sources: s } as never)
              .eq('id', convId)
              .then(({ error }) => {
                if (error) logger.debug('Не удалось сохранить sources диалога:', error)
              })
          }
        },
        [sessionKey, updateAiSession],
      ),
      onAiMessagesChange: useCallback(
        (msgs: AiMessage[]) => updateAiSession(sessionKey, { aiMessages: msgs }),
        [sessionKey, updateAiSession],
      ),
      onSessionDocsChange: useCallback(
        (docs: Record<string, { name: string; text: string }>) =>
          updateAiSession(sessionKey, {
            sessionDocs: Object.keys(docs).length > 0 ? docs : undefined,
          }),
        [sessionKey, updateAiSession],
      ),
    },
  )

  // Синхронизация ref-обёрток для useProjectAiConversations
  useEffect(() => {
    setAiMessagesRef.current = setAiMessages
    setSourcesRef.current = setSources
    startNewChatRef.current = startNewChat
  })

  // Restore saved conversation from DB
  const { restoringConversation } = useProjectAiRestore({
    activeConversationId: session.activeConversationId,
    aiMessages,
    setAiMessages,
    setActiveConversationId,
    setSources,
    conversations,
  })

  // Статусы документов (для цветных кружков)
  const { data: docStatuses = [] } = useDocumentStatuses(workspaceId)
  const statusMap = useMemo(() => new Map(docStatuses.map((s) => [s.id, s])), [docStatuses])

  const {
    docPickerOpen,
    setDocPickerOpen,
    handleOpenDocPicker,
    handleDocumentDrop,
    handleConfirmDocPicker,
    initialPickerSelected,
  } = useProjectAiDocuments({
    attachedDocuments,
    projectDocuments,
    addAttachedDocument,
    removeAttachedDocument,
    disableAllSources,
  })

  // Автопрокрутка
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, streamingContent])

  // Отправка вопроса
  const handleSend = useCallback(
    (text: string) => {
      if ((!text && attachedDocuments.length === 0) || isStreaming) return
      ask(text)
    },
    [isStreaming, ask, attachedDocuments],
  )

  const isEmpty = aiMessages.length === 0 && !isStreaming && !restoringConversation

  return (
    <div className="flex flex-col h-full">
      {/* Tabs bar — диалоги */}
      <ConversationTabsBar
        conversations={conversations}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConversations}
        accent="purple"
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
      />

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {restoringConversation ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
          </div>
        ) : isEmpty ? (
          <ChatEmptyState
            title={hasProject ? 'AI-ассистент проекта' : 'AI-ассистент базы знаний'}
            description={
              hasProject
                ? 'Задайте вопрос по данным проекта. Выберите источники выше: переписку, анкеты или документы.'
                : 'Задайте вопрос, и я найду ответ в статьях базы знаний.'
            }
            accent="purple"
          />
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-4 py-4 overflow-hidden">
              {aiMessages.map((msg, idx) => {
                const prevMsg = idx > 0 ? aiMessages[idx - 1] : null
                const showDate =
                  msg.created_at &&
                  (!prevMsg?.created_at ||
                    new Date(msg.created_at).toDateString() !==
                      new Date(prevMsg.created_at).toDateString())
                return (
                  <div key={msg.id}>
                    {showDate && <ChatDateSeparator date={msg.created_at} />}
                    <AiMessageBubble message={msg} />
                  </div>
                )
              })}
              {isStreaming && streamingContent !== null && (
                <AiStreamingBubble content={streamingContent} />
              )}
              {error && (
                <div className="flex gap-3 py-3">
                  <div className="rounded-lg px-4 py-2.5 bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        )}

        {/* Ввод: источники + скрепка + редактор + отправить */}
        <AiChatInput
          sources={sources}
          toggleSource={toggleSource}
          setKnowledge={setKnowledge}
          clientMessagesCount={clientMessages.length}
          teamMessagesCount={teamMessages.length}
          formKitCount={formKitCount}
          documentCount={documentCount}
          isStreaming={isStreaming}
          attachedDocuments={attachedDocuments}
          addAttachedDocument={addAttachedDocument}
          removeAttachedDocument={removeAttachedDocument}
          projectDocumentsCount={projectDocuments.length}
          onSend={handleSend}
          onStop={stop}
          onOpenDocPicker={handleOpenDocPicker}
          onDocumentDrop={handleDocumentDrop}
          hasKnowledgeProjectAccess={hasKnowledgeProjectAccess}
          hasKnowledgeAllAccess={hasKnowledgeAllAccess}
          hasProject={hasProject}
          hasTeamMessagesAccess={hasTeamMessagesAccess}
        />

        {/* Диалог выбора документов из проекта */}
        <DocumentPickerDialog
          open={docPickerOpen}
          onOpenChange={setDocPickerOpen}
          documents={projectDocuments}
          statusMap={statusMap}
          onConfirm={handleConfirmDocPicker}
          initialSelected={initialPickerSelected}
        />
      </div>
    </div>
  )
}
