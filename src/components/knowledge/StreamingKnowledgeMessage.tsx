"use client"

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Bot } from 'lucide-react'
import type { AccentColor } from './KnowledgeChatMessage'

const accentStyles: Record<AccentColor, { botAvatar: string; botAvatarIcon: string }> = {
  green: { botAvatar: 'bg-green-600/10', botAvatarIcon: 'text-green-600' },
  orange: { botAvatar: 'bg-orange-500/10', botAvatarIcon: 'text-orange-500' },
  blue: { botAvatar: 'bg-blue-500/10', botAvatarIcon: 'text-blue-500' },
  purple: { botAvatar: 'bg-purple-600/10', botAvatarIcon: 'text-purple-600' },
}

interface StreamingKnowledgeMessageProps {
  content: string
  accent?: AccentColor
}

export function StreamingKnowledgeMessage({
  content,
  accent = 'green',
}: StreamingKnowledgeMessageProps) {
  const colors = accentStyles[accent]

  // Hide everything after <!-- CITATIONS during streaming
  const visibleContent = useMemo(() => {
    const idx = content.indexOf('<!-- CITATIONS')
    return idx >= 0 ? content.slice(0, idx).trim() : content
  }, [content])

  return (
    <div className="flex gap-3 py-3 justify-start">
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          colors.botAvatar,
        )}
      >
        <Bot className={cn('h-4 w-4', colors.botAvatarIcon)} />
      </div>

      <div className="max-w-[85%]">
        <div className="rounded-lg px-4 py-2.5 bg-muted">
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:mb-1 [&_p]:mt-2.5 [&_p:first-child]:mt-0 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0 [&_li>p]:my-0">
            {visibleContent ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleContent}</ReactMarkdown>
            ) : null}
            <span className="inline-block w-0.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      </div>
    </div>
  )
}
