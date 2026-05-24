"use client"

/**
 * Содержимое вкладки «статья базы знаний» в боковой панели TaskPanel.
 * Аналог KnowledgeBaseArticleView, но без Dialog-обёртки — рендерится
 * прямо внутри панели как контент текущей активной вкладки.
 *
 * Для access_mode === 'read_only' блокируется Ctrl+C/Ctrl+A и контекстное
 * меню (поведение идентично модальной версии).
 */

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { PageLoader } from '@/components/ui/loaders'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'
import { knowledgeBaseKeys, STALE_TIME } from '@/hooks/queryKeys'

type Props = {
  articleId: string
  onClose: () => void
}

const ACCESS_MODE_LABELS: Record<string, string> = {
  read_only: 'Только чтение',
  read_copy: 'Чтение и копирование',
}

type KnowledgeArticleRow = {
  id: string
  title: string
  content: string | null
  access_mode: string | null
}

export function KnowledgeArticleTabContent({ articleId, onClose }: Props) {
  const { data: article, isLoading, error } = useQuery<KnowledgeArticleRow | null>({
    queryKey: knowledgeBaseKeys.article(articleId),
    enabled: !!articleId,
    staleTime: STALE_TIME.MEDIUM,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('knowledge_articles')
        .select('id, title, content, access_mode')
        .eq('id', articleId)
        .maybeSingle()
      if (err) throw err
      return (data as KnowledgeArticleRow | null) ?? null
    },
  })

  const isReadOnly = article?.access_mode === 'read_only'

  // Блокировка Ctrl+C / Ctrl+A для read_only — только пока эта вкладка
  // активна (компонент монтируется когда вкладка открыта, размонтируется
  // при переключении). Слушатель глобальный, но действует только в этом окне.
  useEffect(() => {
    if (!isReadOnly) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'C', 'a', 'A'].includes(e.key)) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isReadOnly])

  if (isLoading) {
    return <PageLoader />
  }

  if (error || !article) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground text-center">
        Статья недоступна или удалена.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Шапка статьи: название, бэдж режима доступа, кнопка «скрыть» */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base truncate">{article.title}</h3>
        </div>
        {article.access_mode && (
          <Badge variant="secondary" className="shrink-0">
            {ACCESS_MODE_LABELS[article.access_mode] ?? article.access_mode}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          title="Скрыть панель"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Контейнер прокрутки — на всю ширину панели, чтобы скроллбар был у
          правого края, а не вплотную к тексту. Внутренний div центрирует
          контент через max-w-3xl + mx-auto. */}
      <div className="flex-1 overflow-y-auto" onContextMenu={isReadOnly ? (e) => e.preventDefault() : undefined}>
      <div
        className={cn(
          // Стили идентичны KnowledgeBaseArticleView — синхронизировать оба
          // места при изменении prose-классов.
          'prose max-w-3xl mx-auto p-4 w-full',
          'prose-p:my-0 prose-li:my-0 prose-ul:my-0 prose-ol:my-0',
          'prose-h1:my-0 prose-h2:my-0 prose-h3:my-0',
          'prose-blockquote:my-0 prose-pre:my-0 prose-table:my-0',
          'prose-hr:my-0 prose-img:my-0',
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
      </div>
    </div>
  )
}
