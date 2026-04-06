"use client"

/**
 * Просмотр статьи базы знаний
 *
 * Полноэкранный диалог с HTML-контентом (из Tiptap).
 * Для access_mode === 'read_only' блокируется выделение, копирование и контекстное меню.
 */

import { useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'

interface KnowledgeBaseArticleViewProps {
  article: {
    id: string
    title: string
    content?: string | null
    access_mode?: string
  } | null
  open: boolean
  onClose: () => void
}

const ACCESS_MODE_LABELS: Record<string, string> = {
  read_only: 'Только чтение',
  read_copy: 'Чтение и копирование',
}

export function KnowledgeBaseArticleView({
  article,
  open,
  onClose,
}: KnowledgeBaseArticleViewProps) {
  // Блокировка Ctrl+C / Ctrl+A для read_only
  useEffect(() => {
    if (!open || article?.access_mode !== 'read_only') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'c' || e.key === 'a' || e.key === 'C' || e.key === 'A')
      ) {
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, article?.access_mode])

  if (!article) return null

  const isReadOnly = article.access_mode === 'read_only'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onContextMenu={isReadOnly ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="flex-1">{article.title}</DialogTitle>
            <Badge variant="secondary" className="shrink-0">
              {ACCESS_MODE_LABELS[article.access_mode ?? ''] ?? article.access_mode}
            </Badge>
          </div>
        </DialogHeader>

        <div
          className={cn(
            // prose нужен для CSS-стилей callout/accordion/columns в index.css
            'prose max-w-none p-4',
            // Сброс prose-отступов, чтобы не было огромных gap между элементами
            'prose-p:my-0 prose-li:my-0 prose-ul:my-0 prose-ol:my-0',
            'prose-h1:my-0 prose-h2:my-0 prose-h3:my-0',
            'prose-blockquote:my-0 prose-pre:my-0 prose-table:my-0',
            'prose-hr:my-0 prose-img:my-0',
            // Стили, идентичные TiptapEditor
            '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6',
            '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5',
            '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4',
            '[&_p]:mb-2 [&_p]:leading-relaxed [&_p:empty]:min-h-[1em]',
            '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2',
            '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2',
            '[&_li]:mb-0 [&_li_p]:mb-0 [&_li_p:empty]:min-h-[1em] [&_li_p:has(>br:only-child)]:min-h-[1em]',
            '[&_a]:text-primary [&_a]:underline',
            '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
            '[&_code]:bg-[#eeeef1] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono',
            '[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_pre]:overflow-x-auto',
            '[&_table]:w-full [&_table]:border-collapse [&_table]:my-4',
            '[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left',
            '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
            '[&_th_p]:mb-0 [&_td_p]:mb-0',
            '[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3',
            '[&_hr]:my-6 [&_hr]:border-border',
            isReadOnly && 'select-none',
          )}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content ?? '') }}
        />
      </DialogContent>
    </Dialog>
  )
}
