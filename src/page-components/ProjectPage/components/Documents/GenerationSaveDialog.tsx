"use client"

/**
 * Диалог выбора папки для сохранения сгенерированного PDF
 */

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, FolderDown, Download } from 'lucide-react'

interface FolderInfo {
  id: string
  name: string
  document_kit_id: string
}

interface GenerationSaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName?: string
  folders: FolderInfo[]
  isSaving: boolean
  savingFolderId: string | null | undefined
  onSaveToFolder: (folder: FolderInfo | null) => void
  onDownload: () => void
}

export function GenerationSaveDialog({
  open,
  onOpenChange,
  fileName,
  folders,
  isSaving,
  savingFolderId,
  onSaveToFolder,
  onDownload,
}: GenerationSaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PDF сгенерирован</DialogTitle>
          <DialogDescription>
            {fileName}
            {' — '}
            выберите папку для сохранения или скачайте файл
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {folders.length > 0 ? (
            <>
              {folders.map((folder) => (
                <Button
                  key={folder.id}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => onSaveToFolder(folder)}
                  disabled={isSaving}
                >
                  {isSaving && savingFolderId === folder.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FolderDown className="h-4 w-4 mr-2 text-muted-foreground" />
                  )}
                  {folder.name}
                </Button>
              ))}

              {/* Без папки */}
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground"
                onClick={() => onSaveToFolder(null)}
                disabled={isSaving}
              >
                {isSaving && savingFolderId === null ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FolderDown className="h-4 w-4 mr-2" />
                )}
                Без папки (нераспределённые)
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSaveToFolder(null)}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderDown className="h-4 w-4 mr-2 text-muted-foreground" />
              )}
              Сохранить в проект
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onDownload} disabled={isSaving}>
            <Download className="h-4 w-4 mr-1.5" />
            Скачать на компьютер
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
