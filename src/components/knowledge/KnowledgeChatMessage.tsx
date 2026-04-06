"use client"

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Bot, User, FileText, MessageCircleQuestion, Quote } from 'lucide-react'
import type { KnowledgeMessage, SearchSource } from '@/services/api/knowledgeSearchService'

export type AccentColor = 'green' | 'orange' | 'blue' | 'purple'

const accentStyles: Record<
  AccentColor,
  {
    userBubble: string
    userAvatar: string
    botAvatar: string
    botAvatarIcon: string
    sourceTitle: string
    sourceTitleHover: string
  }
> = {
  green: {
    userBubble: 'bg-green-600 text-white',
    userAvatar: 'bg-green-600',
    botAvatar: 'bg-green-600/10',
    botAvatarIcon: 'text-green-600',
    sourceTitle: 'text-green-700',
    sourceTitleHover: 'hover:bg-green-50',
  },
  orange: {
    userBubble: 'bg-orange-500 text-white',
    userAvatar: 'bg-orange-500',
    botAvatar: 'bg-orange-500/10',
    botAvatarIcon: 'text-orange-500',
    sourceTitle: 'text-orange-600',
    sourceTitleHover: 'hover:bg-orange-50',
  },
  blue: {
    userBubble: 'bg-blue-500 text-white',
    userAvatar: 'bg-blue-500',
    botAvatar: 'bg-blue-500/10',
    botAvatarIcon: 'text-blue-500',
    sourceTitle: 'text-blue-600',
    sourceTitleHover: 'hover:bg-blue-50',
  },
  purple: {
    userBubble: 'bg-purple-600 text-white',
    userAvatar: 'bg-purple-600',
    botAvatar: 'bg-purple-600/10',
    botAvatarIcon: 'text-purple-600',
    sourceTitle: 'text-purple-700',
    sourceTitleHover: 'hover:bg-purple-50',
  },
}

interface KnowledgeChatMessageProps {
  message: KnowledgeMessage
  accent?: AccentColor
  onSourceClick?: (sourceId: string, sourceType: 'article' | 'qa') => void
}

const CITATION_SEPARATOR = '<!-- CITATIONS -->'

const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node: _node, ...props }: Record<string, unknown>) => (
    <a
      {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  table: ({ node: _node, ...props }: Record<string, unknown>) => (
    <div className="overflow-x-auto">
      <table {...(props as React.TableHTMLAttributes<HTMLTableElement>)} className="text-sm" />
    </div>
  ),
}

/** Strip the <!-- CITATIONS --> section from the AI response */
function stripCitations(content: string): string {
  if (!content.includes(CITATION_SEPARATOR)) return content
  return content.split(CITATION_SEPARATOR)[0].trim()
}

/** Deduplicate sources by article/qa ID */
function deduplicateSources(sources: SearchSource[]): Array<{
  id: string
  title: string
  sourceType: 'article' | 'qa'
}> {
  const seen = new Set<string>()
  const result: Array<{ id: string; title: string; sourceType: 'article' | 'qa' }> = []

  for (const s of sources) {
    const sourceId = s.article_id ?? s.qa_id ?? ''
    if (seen.has(sourceId)) continue
    seen.add(sourceId)
    result.push({
      id: sourceId,
      title: s.article_title,
      sourceType: s.source_type ?? 'article',
    })
  }

  return result
}

export function KnowledgeChatMessage({
  message,
  accent = 'green',
  onSourceClick,
}: KnowledgeChatMessageProps) {
  const isUser = message.role === 'user'
  const colors = accentStyles[accent]

  // Strip citations block from AI response (we show sources from message.sources instead)
  const displayContent = useMemo(
    () => (isUser ? message.content : stripCitations(message.content)),
    [message.content, isUser],
  )

  // Deduplicate sources for display — server already filters to only used sources
  const uniqueSources = useMemo(() => {
    if (!message.sources) return []
    return deduplicateSources(message.sources as SearchSource[])
  }, [message.sources])

  return (
    <div className={cn('flex gap-3 py-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            colors.botAvatar,
          )}
        >
          <Bot className={cn('h-4 w-4', colors.botAvatarIcon)} />
        </div>
      )}

      <div className={cn('max-w-[85%]', isUser ? '' : 'space-y-3')}>
        {/* Main message bubble */}
        {(isUser || displayContent) && (
          <div className={cn('rounded-lg px-4 py-2.5', isUser ? colors.userBubble : 'bg-muted')}>
            {isUser ? (
              <div className="text-sm whitespace-pre-wrap break-words">
                {message.content}
                {message.created_at && (
                  <span className="ml-2 text-[10px] opacity-50 font-normal">
                    {new Date(message.created_at).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:mb-1 [&_p]:mt-2.5 [&_p:first-child]:mt-0 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0 [&_li>p]:my-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents as never}>
                  {displayContent}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Source links */}
        {!isUser && uniqueSources.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium px-1">
              <Quote className="h-3 w-3" />
              Источники ({uniqueSources.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {uniqueSources.map((source) => {
                const Icon = source.sourceType === 'qa' ? MessageCircleQuestion : FileText
                return (
                  <button
                    key={source.id}
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors',
                      colors.sourceTitle,
                      colors.sourceTitleHover,
                    )}
                    onClick={() => onSourceClick?.(source.id, source.sourceType)}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate max-w-[200px]">{source.title}</span>
                    {source.sourceType === 'qa' && (
                      <span className="text-[10px] text-muted-foreground font-medium uppercase flex-shrink-0">
                        Q&A
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            colors.userAvatar,
          )}
        >
          <User className="h-4 w-4 text-white" />
        </div>
      )}
    </div>
  )
}
