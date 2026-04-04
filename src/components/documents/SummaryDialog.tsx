"use client"

/**
 * Диалог сводки по набору документов
 */

import { Copy, Check as CheckIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface SummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: string
  loading: boolean
  copied: boolean
  onCopy: () => void
}

export function SummaryDialog({
  open,
  onOpenChange,
  text,
  loading,
  copied,
  onCopy,
}: SummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Сводка по документам</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Загрузка...
          </div>
        ) : (
          <>
            <pre className="text-sm whitespace-pre-wrap break-words bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto font-sans">
              {text}
            </pre>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2" onClick={onCopy}>
                {copied ? <CheckIcon className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
