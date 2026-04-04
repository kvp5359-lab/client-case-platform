"use client"

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Cloud } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SourceSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isConnected: boolean
  folderName: string | null
  sourceFolderLink: string
  onLinkChange: (link: string) => void
  onSave: () => void | Promise<void>
  isSaving?: boolean
}

export function SourceSettingsDialog({
  open,
  onOpenChange,
  isConnected,
  folderName,
  sourceFolderLink,
  onLinkChange,
  onSave,
  isSaving,
}: SourceSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Настройки источника документов</DialogTitle>
          <DialogDescription>Управление подключением к папке Google Drive</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Статус подключения */}
          <div className="space-y-2">
            <Label>Статус подключения</Label>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
              />
              <span className="text-sm">{isConnected ? 'Подключено' : 'Не подключено'}</span>
            </div>
          </div>

          {/* Название папки */}
          {isConnected && folderName && (
            <div className="space-y-2">
              <Label>Название папки</Label>
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <Cloud className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{folderName}</span>
              </div>
            </div>
          )}

          {/* Ссылка на папку */}
          <div className="space-y-2">
            <Label htmlFor="source-settings-link">Ссылка на папку Google Drive</Label>
            <Input
              id="source-settings-link"
              placeholder="https://drive.google.com/drive/folders/..."
              value={sourceFolderLink}
              onChange={(e) => onLinkChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Измените ссылку для подключения к другой папке
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="outline"
            onClick={onSave}
            disabled={!sourceFolderLink.trim() || isSaving}
          >
            Подключить
          </Button>
          <Button
            onClick={async () => {
              try {
                await onSave()
                onOpenChange(false)
              } catch {
                // onSave обрабатывает ошибку toast'ом, диалог остаётся открытым
              }
            }}
            disabled={!sourceFolderLink.trim() || isSaving}
          >
            Подключить и закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
