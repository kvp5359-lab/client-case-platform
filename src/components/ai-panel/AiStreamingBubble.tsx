import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot } from 'lucide-react'

interface AiStreamingBubbleProps {
  content: string | null
}

export function AiStreamingBubble({ content }: AiStreamingBubbleProps) {
  return (
    <div className="flex gap-3 py-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-purple-600/10">
        <Bot className="h-4 w-4 text-purple-600" />
      </div>
      <div className="max-w-[85%]">
        <div className="rounded-lg px-4 py-2.5 bg-muted">
          <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_hr]:my-3 [&_blockquote]:not-italic [&_blockquote]:font-normal [&_blockquote_p]:text-muted-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none">
            {content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown> : null}
            <span className="inline-block w-0.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      </div>
    </div>
  )
}
