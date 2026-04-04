"use client"

import { Button } from '@/components/ui/button'
import { Loader2, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ContentViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentName: string
  content: string | null
  isLoading: boolean
  onClearContent?: () => void
}

export function ContentViewDialog({
  open,
  onOpenChange,
  documentName,
  content,
  isLoading,
  onClearContent,
}: ContentViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Содержимое документа</DialogTitle>
          <DialogDescription>{documentName || 'Документ'}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-muted/30 max-h-[60vh] overflow-y-auto">
              {content ? (
                <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Содержимое документа еще не извлечено. Выполните проверку документа, чтобы извлечь
                  текст.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          {onClearContent && content ? (
            <Button
              variant="outline"
              onClick={onClearContent}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Очистить
            </Button>
          ) : (
            <div />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
