"use client"

import { useRef, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Search, Zap } from 'lucide-react'
import { useKnowledgeSearch } from '@/hooks/knowledge/useKnowledgeSearch'
import { useKnowledgeConversations } from '@/hooks/knowledge/useKnowledgeConversations'
import { KnowledgeChatInput } from './KnowledgeChatInput'
import { KnowledgeChatMessage, type AccentColor } from './KnowledgeChatMessage'
import { StreamingKnowledgeMessage } from './StreamingKnowledgeMessage'
import { SourceSelectionList } from './SourceSelectionList'
import type { KnowledgeConversation } from '@/services/api/knowledge/knowledgeSearchService'
import { cn } from '@/lib/utils'
import { ConversationTabsBar } from '@/components/shared/ConversationTabsBar'
import { ChatDateSeparator } from '@/components/shared/ChatDateSeparator'
import { ChatEmptyState } from '@/components/shared/ChatEmptyState'

interface KnowledgeChatProps {
  workspaceId: string
  projectId?: string
  templateId?: string
  className?: string
  accent?: AccentColor
  /** @deprecated No longer used */
  compact?: boolean
}

export function KnowledgeChat({
  workspaceId,
  projectId,
  templateId,
  className,
  accent = 'purple',
}: KnowledgeChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    activeConversationId,
    isSearching,
    isStreaming,
    streamingContent,
    ask,
    loadConversation,
    startNewConversation,
    searchMode,
    setSearchMode,
    foundSources,
    selectedSourceIds,
    isSearchingSources,
    toggleSource,
    generateFromSelected,
    dismissSources,
  } = useKnowledgeSearch({ workspaceId, projectId, templateId })

  const {
    conversations,
    isLoading: loadingConversations,
    deleteConversation,
    renameConversation,
  } = useKnowledgeConversations({ workspaceId, projectId })

  // Scroll to bottom on new messages, streaming content, or source selection
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, foundSources])

  const handleSelectConversation = useCallback(
    async (conv: KnowledgeConversation) => {
      const { getKnowledgeMessages } = await import('@/services/api/knowledge/knowledgeSearchService')
      const msgs = await getKnowledgeMessages(conv.id)
      loadConversation(conv, msgs)
    },
    [loadConversation],
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id)
      if (activeConversationId === id) {
        startNewConversation()
      }
    },
    [deleteConversation, activeConversationId, startNewConversation],
  )

  const handleSourceClick = useCallback(
    (sourceId: string, sourceType: 'article' | 'qa') => {
      if (sourceType === 'qa' && sourceId) {
        window.open(`/workspaces/${workspaceId}/settings/knowledge-base/qa/${sourceId}`, '_blank')
      } else if (sourceType === 'qa' || !sourceId) {
        window.open(`/workspaces/${workspaceId}/settings/knowledge-base?tab=qa`, '_blank')
      } else {
        window.open(`/workspaces/${workspaceId}/settings/knowledge-base/${sourceId}`, '_blank')
      }
    },
    [workspaceId],
  )

  const handleNewConversation = useCallback(() => {
    startNewConversation()
  }, [startNewConversation])

  const handleRenameConversation = useCallback(
    (id: string, title: string) => {
      renameConversation({ id, title })
    },
    [renameConversation],
  )

  const accentIcon =
    accent === 'orange'
      ? 'text-orange-500'
      : accent === 'blue'
        ? 'text-blue-500'
        : accent === 'purple'
          ? 'text-purple-600'
          : 'text-green-600'
  const accentBg =
    accent === 'orange'
      ? 'bg-orange-500/10'
      : accent === 'blue'
        ? 'bg-blue-500/10'
        : accent === 'purple'
          ? 'bg-purple-600/10'
          : 'bg-green-600/10'

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tabs bar */}
      <ConversationTabsBar
        conversations={conversations}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConversations}
        accent={accent}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
      />

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {messages.length === 0 && !foundSources && !isSearchingSources ? (
          <ChatEmptyState
            title="AI-ассистент базы знаний"
            description={
              projectId
                ? 'Задайте вопрос, и я найду ответ в материалах проекта.'
                : 'Задайте вопрос, и я найду ответ в статьях базы знаний.'
            }
            accent={accent}
          />
        ) : (
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-4 py-4">
              {messages.map((msg, idx) => {
                const prevMsg = idx > 0 ? messages[idx - 1] : null
                const showDate =
                  msg.created_at &&
                  (!prevMsg?.created_at ||
                    new Date(msg.created_at).toDateString() !==
                      new Date(prevMsg.created_at).toDateString())
                return (
                  <div key={msg.id}>
                    {showDate && <ChatDateSeparator date={msg.created_at} />}
                    <KnowledgeChatMessage
                      message={msg}
                      accent={accent}
                      onSourceClick={handleSourceClick}
                    />
                  </div>
                )
              })}
              {isSearching && !isStreaming && !foundSources && (
                <div className="flex gap-3 py-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      accentBg,
                    )}
                  >
                    <Loader2 className={cn('h-4 w-4 animate-spin', accentIcon)} />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-2.5">
                    <p className="text-sm text-muted-foreground">
                      {isSearchingSources ? 'Ищу источники...' : 'Ищу в базе знаний...'}
                    </p>
                  </div>
                </div>
              )}
              {foundSources && foundSources.length > 0 && (
                <SourceSelectionList
                  sources={foundSources}
                  selectedIds={selectedSourceIds}
                  onToggle={toggleSource}
                  onGenerate={generateFromSelected}
                  onDismiss={dismissSources}
                  accent={accent}
                />
              )}
              {isStreaming && streamingContent !== null && (
                <StreamingKnowledgeMessage content={streamingContent} accent={accent} />
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        )}

        {/* Mode toggle + input */}
        <div className="border-t">
          <div className="flex items-center gap-2 px-4 pt-2">
            <div className="inline-flex h-8 rounded-lg bg-stone-200/80 p-1 gap-0.5">
              <button
                type="button"
                onClick={() => setSearchMode('selective')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all',
                  searchMode === 'selective'
                    ? cn(
                        'text-white shadow-sm',
                        accent === 'orange'
                          ? 'bg-orange-500'
                          : accent === 'blue'
                            ? 'bg-blue-500'
                            : accent === 'purple'
                              ? 'bg-purple-600'
                              : 'bg-green-600',
                      )
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Search className="h-3 w-3" />
                Выбор источников
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('quick')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all',
                  searchMode === 'quick'
                    ? cn(
                        'text-white shadow-sm',
                        accent === 'orange'
                          ? 'bg-orange-500'
                          : accent === 'blue'
                            ? 'bg-blue-500'
                            : accent === 'purple'
                              ? 'bg-purple-600'
                              : 'bg-green-600',
                      )
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <Zap className="h-3 w-3" />
                Быстрый ответ
              </button>
            </div>
          </div>
          <KnowledgeChatInput
            onSend={(q) => ask(q)}
            isLoading={isSearching || !!foundSources}
            accent={accent}
            placeholder={
              projectId
                ? 'Задайте вопрос по материалам проекта...'
                : 'Задайте вопрос по базе знаний...'
            }
          />
        </div>
      </div>
    </div>
  )
}
