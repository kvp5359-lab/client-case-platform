"use client"

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

export type SyncMode = 'replace_all' | 'add_only' | 'replace_existing'

interface SyncModeOption {
  title: string
  description: string
}

const syncModeOptions: Record<SyncMode, SyncModeOption> = {
  replace_all: {
    title: 'Удалить всё и загрузить заново',
    description: 'Удалит все файлы и папки в целевой папке перед загрузкой',
  },
  add_only: {
    title: 'Добавить к существующим',
    description: 'Оставит существующие файлы и папки, добавит только новые',
  },
  replace_existing: {
    title: 'Заменить существующие',
    description: 'Заменит файлы и папки с одинаковыми названиями',
  },
}

interface ExportToGoogleDriveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderLink: string
  selectedCount: number
  isExporting: boolean
  syncMode: SyncMode
  onLinkChange: (link: string) => void
  onSyncModeChange: (mode: SyncMode) => void
  onExport: () => void
}

export function ExportToGoogleDriveDialog({
  open,
  onOpenChange,
  folderLink,
  selectedCount,
  isExporting,
  syncMode,
  onLinkChange,
  onSyncModeChange,
  onExport,
}: ExportToGoogleDriveDialogProps) {
  const selectedOption = syncModeOptions[syncMode]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Выгрузить документы на Google Диск</DialogTitle>
          <DialogDescription>
            Введите ссылку на папку Google Диска, куда будут выгружены выбранные документы (
            {selectedCount} шт.)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="google-drive-folder-link">Ссылка на папку Google Диска</Label>
            <Input
              id="google-drive-folder-link"
              value={folderLink}
              onChange={(e) => onLinkChange(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/1ABC..."
              disabled={isExporting}
            />
            <p className="text-xs text-muted-foreground">
              Скопируйте ссылку на папку из браузера или вставьте ID папки
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sync-mode">Режим синхронизации</Label>
            <Select
              value={syncMode}
              onValueChange={(value) => onSyncModeChange(value as SyncMode)}
              disabled={isExporting}
            >
              <SelectTrigger
                id="sync-mode"
                className="h-auto min-h-[4rem] items-start py-3 whitespace-normal [&>span]:line-clamp-none"
              >
                <div className="flex flex-col gap-0.5 text-left pr-6 w-full">
                  <span className="font-medium text-sm leading-tight">{selectedOption.title}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    {selectedOption.description}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
                <SelectItem value="replace_all" className="items-start py-2">
                  <div className="flex flex-col gap-0.5 pr-6">
                    <span className="font-medium text-sm leading-tight">
                      {syncModeOptions.replace_all.title}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {syncModeOptions.replace_all.description}
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="add_only" className="items-start py-2">
                  <div className="flex flex-col gap-0.5 pr-6">
                    <span className="font-medium text-sm leading-tight">
                      {syncModeOptions.add_only.title}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {syncModeOptions.add_only.description}
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="replace_existing" className="items-start py-2">
                  <div className="flex flex-col gap-0.5 pr-6">
                    <span className="font-medium text-sm leading-tight">
                      {syncModeOptions.replace_existing.title}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {syncModeOptions.replace_existing.description}
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex gap-2 justify-end pt-4">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onLinkChange('')
            }}
            disabled={isExporting}
          >
            Отмена
          </Button>
          <Button onClick={onExport} disabled={!folderLink.trim() || isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Выгрузка...
              </>
            ) : (
              'Выгрузить'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
