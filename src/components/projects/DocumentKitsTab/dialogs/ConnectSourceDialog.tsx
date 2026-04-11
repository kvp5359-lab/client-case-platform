"use client"

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConnectSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceFolderLink: string
  onLinkChange: (link: string) => void
  onConnect: () => void
}

export function ConnectSourceDialog({
  open,
  onOpenChange,
  sourceFolderLink,
  onLinkChange,
  onConnect,
}: ConnectSourceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключить источник документов</DialogTitle>
          <DialogDescription>
            Вставьте ссылку на папку Google Drive, которая будет служить источником нераспределённых
            документов
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="source-folder-link">Ссылка на папку Google Drive</Label>
            <Input
              id="source-folder-link"
              placeholder="https://drive.google.com/drive/folders/..."
              value={sourceFolderLink}
              onChange={(e) => onLinkChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Документы из этой папки будут отображаться в разделе «Нераспределённые»
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onLinkChange('')
            }}
          >
            Отмена
          </Button>
          <Button onClick={onConnect} disabled={!sourceFolderLink.trim()}>
            Подключить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
