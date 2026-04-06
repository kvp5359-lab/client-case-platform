"use client"

/**
 * Диалог истории версий статьи базы знаний
 */

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { RotateCcw, Eye, Clock, FileText, ArrowLeft } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useArticleVersions, useArticleVersion } from '@/hooks/knowledge'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'

interface ArticleVersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleId: string
  onRestore: (versionId: string) => void
  isRestoring: boolean
}

export function ArticleVersionHistoryDialog({
  open,
  onOpenChange,
  articleId,
  onRestore,
  isRestoring,
}: ArticleVersionHistoryDialogProps) {
  const { versions, isLoading } = useArticleVersions(articleId)
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null)
  const { data: previewVersion, isLoading: isLoadingPreview } = useArticleVersion(
    previewVersionId ?? undefined,
  )

  const handleOpenChange = (value: boolean) => {
    if (!value) setPreviewVersionId(null)
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{previewVersionId ? 'Просмотр версии' : 'История версий'}</DialogTitle>
        </DialogHeader>

        {previewVersionId ? (
          // Просмотр конкретной версии
          <div className="flex-1 overflow-auto space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isLoadingPreview ? (
                  <span className="text-sm text-muted-foreground">Загрузка...</span>
                ) : previewVersion ? (
                  <>
                    <span className="font-medium">Версия {previewVersion.version}</span>
                    <span className="text-sm text-muted-foreground">{previewVersion.title}</span>
                    {previewVersion.comment && (
                      <span className="text-sm italic text-muted-foreground">
                        — {previewVersion.comment}
                      </span>
                    )}
                  </>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewVersionId(null)}>
                  <ArrowLeft className="w-4 h-4 mr-1" />К списку
                </Button>
                {previewVersion && !previewVersion.is_current && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onRestore(previewVersion.id)
                      setPreviewVersionId(null)
                    }}
                    disabled={isRestoring}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Восстановить
                  </Button>
                )}
              </div>
            </div>
            {previewVersion && (
              <div
                className="prose prose-sm max-w-none border rounded-lg p-4 bg-muted/20 overflow-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewVersion.content ?? '') }}
              />
            )}
          </div>
        ) : (
          // Список версий
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Нет сохранённых версий. Нажмите «Сохранить» чтобы создать первую.
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium shrink-0">v{v.version}</span>
                      {v.is_current && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          текущая
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground truncate">
                        {v.title}
                        {v.comment && <span className="italic"> — {v.comment}</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(v.created_at), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPreviewVersionId(v.id)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {!v.is_current && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onRestore(v.id)}
                          disabled={isRestoring}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
