/**
 * KnowledgeQADetailPage — страница просмотра одной Q&A записи.
 * URL: /workspaces/:workspaceId/settings/knowledge-base/qa/:qaId
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  Calendar,
  Globe,
  CheckCircle2,
  Clock,
  AlertCircle,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { QAEditDialog } from '@/components/knowledge/QAEditDialog'
import type { KnowledgeQA } from '@/services/api/knowledge/knowledgeSearchService'
import { getTagColors } from '@/utils/notionPill'
import { safeCssColor } from '@/utils/isValidCssColor'

// ---------- Helpers ----------

function IndexingStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'indexed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          Проиндексировано
        </span>
      )
    case 'indexing':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          Индексируется
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
          <AlertCircle className="w-3 h-3" />
          Ошибка
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3" />
          Не индексировано
        </span>
      )
  }
}

// ---------- Main ----------

export default function KnowledgeQADetailPage() {
  const { workspaceId, qaId } = useParams<{ workspaceId: string; qaId: string }>()
  const router = useRouter()
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const qaQuery = useQuery({
    queryKey: [...knowledgeBaseKeys.qa(workspaceId ?? ''), qaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_qa')
        .select(
          `
          *,
          knowledge_qa_tags(tag_id, knowledge_tags(*)),
          knowledge_qa_groups(group_id, knowledge_groups(*))
        `,
        )
        .eq('id', qaId!)
        .single()
      if (error) throw error
      return data as KnowledgeQA
    },
    enabled: !!workspaceId && !!qaId,
  })

  const qa = qaQuery.data

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Ссылка скопирована')
  }

  if (!workspaceId || !qaId) {
    return (
      <WorkspaceLayout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Запись не найдена</p>
        </div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/workspaces/${workspaceId}/settings/knowledge-base?tab=qa`)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Назад
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              <Link2 className="w-4 h-4 mr-1.5" />
              Копировать ссылку
            </Button>
            <Button size="sm" onClick={() => setEditDialogOpen(true)}>
              <Pencil className="w-4 h-4 mr-1.5" />
              Редактировать
            </Button>
          </div>

          {/* Loading */}
          {qaQuery.isLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка...
            </div>
          )}

          {/* Error */}
          {qaQuery.isError && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Не удалось загрузить запись</p>
            </Card>
          )}

          {/* Content */}
          {qa && (
            <Card className="p-6 space-y-5">
              {/* Title row */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-orange-50">
                  <MessageCircleQuestion className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-semibold text-orange-500 tracking-wider">
                      Q&A
                    </span>
                    <IndexingStatusBadge status={qa.indexing_status} />
                    {!qa.is_published && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Черновик
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Question */}
              <div>
                <h2 className="text-lg font-semibold mb-2">Вопрос</h2>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{qa.question}</p>
              </div>

              <Separator />

              {/* Answer */}
              <div>
                <h2 className="text-lg font-semibold mb-2">Ответ</h2>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{qa.answer}</p>
              </div>

              {/* Original question/answers */}
              {(qa.original_question || qa.original_answers) && (
                <>
                  <Separator />
                  {qa.original_question && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1.5">
                        Исходный вопрос
                      </h3>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                        {qa.original_question}
                      </p>
                    </div>
                  )}
                  {qa.original_answers && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1.5">
                        Исходные ответы
                      </h3>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                        {qa.original_answers}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Metadata */}
              <Separator />
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                {qa.source && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    {qa.source}
                  </div>
                )}
                {qa.qa_date && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(qa.qa_date).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                )}
              </div>

              {/* Tags & Groups */}
              {((qa.knowledge_qa_tags && qa.knowledge_qa_tags.length > 0) ||
                (qa.knowledge_qa_groups && qa.knowledge_qa_groups.length > 0)) && (
                <div className="flex flex-wrap gap-1.5">
                  {qa.knowledge_qa_groups?.map((g) => {
                    if (!g.knowledge_groups) return null
                    const c = g.knowledge_groups.color
                      ? getTagColors(g.knowledge_groups.color)
                      : { bg: '#F1F5F9', text: '#334155' }
                    return (
                      <span
                        key={g.group_id}
                        className="inline-block text-[11px] leading-[18px] px-2 rounded-sm font-medium"
                        style={{ backgroundColor: c.bg, color: c.text }}
                      >
                        {g.knowledge_groups.name}
                      </span>
                    )
                  })}
                  {qa.knowledge_qa_tags?.map((t) => (
                    <span
                      key={t.tag_id}
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white"
                      style={{ backgroundColor: safeCssColor(t.knowledge_tags.color) }}
                    >
                      {t.knowledge_tags.name}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      {qa && (
        <QAEditDialog
          workspaceId={workspaceId}
          qa={qa}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open)
            if (!open) qaQuery.refetch()
          }}
        />
      )}
    </WorkspaceLayout>
  )
}
