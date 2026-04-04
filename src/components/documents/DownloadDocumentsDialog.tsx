"use client"

/**
 * Диалог скачивания документов в ZIP
 * Используется как из пакетных действий, так и при скачивании набора целиком
 */

import { useState } from 'react'
import { Download, Folder, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatSize } from '@/utils/formatSize'
import type { DownloadGroupMode } from '@/services/documents/downloadDocumentsAsZip'

interface DownloadDocumentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  docCount: number
  totalSize: number
  hasFolders: boolean
  isDownloading: boolean
  onConfirm: (mode: DownloadGroupMode) => void
}

export function DownloadDocumentsDialog({
  open,
  onOpenChange,
  docCount,
  totalSize,
  hasFolders,
  isDownloading,
  onConfirm,
}: DownloadDocumentsDialogProps) {
  const [mode, setMode] = useState<DownloadGroupMode>('flat')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Скачать документы</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {docCount} {docCount === 1 ? 'документ' : docCount < 5 ? 'документа' : 'документов'} ·{' '}
            {formatSize(totalSize)}
          </div>

          {hasFolders && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('flat')}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
                  mode === 'flat'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                }`}
              >
                <FileText className="h-5 w-5" />
                Только файлы
              </button>
              <button
                type="button"
                onClick={() => setMode('folders')}
                className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
                  mode === 'folders'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                }`}
              >
                <Folder className="h-5 w-5" />С папками
              </button>
            </div>
          )}

          <Button className="w-full" onClick={() => onConfirm(mode)} disabled={isDownloading}>
            <Download className="h-4 w-4 mr-2" />
            {isDownloading ? 'Скачивание...' : 'Скачать ZIP'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
