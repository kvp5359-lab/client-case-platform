"use client"

/**
 * SlotHelpButton — кнопка «?» у слота с требованиями/описанием.
 *
 * Если у слота привязана статья БЗ (knowledge_article_id) — по клику
 * открывается Dialog с контентом статьи (как у папок).
 * Иначе, если задан description — показываем Popover с текстом.
 * Если нет ни того, ни другого — компонент возвращает null.
 */

import { memo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { getArticleById } from '@/services/api/knowledge/knowledgeBaseService'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'

interface SlotHelpButtonProps {
  slotName: string
  description: string | null
  knowledgeArticleId: string | null
}

export const SlotHelpButton = memo(function SlotHelpButton({
  slotName,
  description,
  knowledgeArticleId,
}: SlotHelpButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: article } = useQuery({
    queryKey: knowledgeBaseKeys.article(knowledgeArticleId!),
    queryFn: () => getArticleById(knowledgeArticleId!),
    enabled: !!knowledgeArticleId,
  })

  if (!knowledgeArticleId && !description) return null

  const hasArticle = !!knowledgeArticleId
  const htmlContent = hasArticle ? article?.content ?? '' : description ?? ''
  const isLoadingArticle = hasArticle && !article

  return (
    <>
      <button
        type="button"
        className="p-0.5 rounded text-brand-500 hover:text-brand-600 transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          setIsDialogOpen(true)
        }}
        title="Требования к документу"
      >
        <HelpCircle className="h-[13px] w-[13px]" />
      </button>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Слот: {slotName}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {isLoadingArticle ? (
              <p className="text-sm text-muted-foreground">Загрузка статьи...</p>
            ) : (
              <div
                className={cn(
                  'prose max-w-none',
                  'prose-p:my-0 prose-li:my-0 prose-ul:my-0 prose-ol:my-0',
                  'prose-h1:my-0 prose-h2:my-0 prose-h3:my-0',
                  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6',
                  '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5',
                  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4',
                  '[&_p]:mb-2 [&_p]:leading-relaxed [&_p:empty]:min-h-[1em]',
                  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2',
                  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2',
                  '[&_li]:mb-0 [&_li_p]:mb-0',
                  '[&_a]:text-primary [&_a]:underline',
                  '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
                  '[&_code]:bg-[#eeeef1] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono',
                  '[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3',
                )}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
