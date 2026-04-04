/**
 * Message bubble for AI chat — renders user/assistant messages with source tags.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User, MessageSquare, ClipboardList, FileText, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiMessage } from '@/store/sidePanelStore'

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const sourceIcons: Record<string, typeof MessageSquare> = {
  Переписка: MessageSquare,
  Анкеты: ClipboardList,
  Документы: FileText,
}

function getSourceIcon(tag: string) {
  if (tag.startsWith('attached:')) return Paperclip
  return sourceIcons[tag] ?? FileText
}

export function AiMessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3 py-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-purple-600/10">
          <Bot className="h-4 w-4 text-purple-600" />
        </div>
      )}
      <div className="max-w-[85%]">
        <div
          className={cn('rounded-lg px-4 py-2.5', isUser ? 'bg-purple-600 text-white' : 'bg-muted')}
        >
          {isUser ? (
            <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_hr]:my-3 [&_blockquote]:not-italic [&_blockquote]:font-normal [&_blockquote_p]:text-muted-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {isUser && (
          <div className="flex items-center gap-1 justify-end mt-1">
            {message.sourceTags &&
              message.sourceTags.length > 0 &&
              message.sourceTags.map((tag) => {
                const Icon = getSourceIcon(tag)
                const displayName = tag.startsWith('attached:') ? tag.slice(9) : tag
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {displayName}
                  </span>
                )
              })}
            {message.created_at && (
              <span className="text-[10px] text-muted-foreground/60">
                {formatTime(message.created_at)}
              </span>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-purple-600">
          <User className="h-4 w-4 text-white" />
        </div>
      )}
    </div>
  )
}
