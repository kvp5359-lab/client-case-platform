"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Cloud, CheckCircle2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DocumentKitSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void

  // Source folder
  isSourceConnected: boolean
  sourceFolderName: string | null
  sourceFolderLink: string
  onSourceLinkChange: (link: string) => void
  onSaveSourceSettings: () => void

  // Export folder
  isExportFolderConnected: boolean
  exportFolderName: string | null
  exportFolderLink: string
  onExportLinkChange: (link: string) => void
  onSaveExportSettings: () => void
}

export function DocumentKitSettingsDialog({
  open,
  onOpenChange,
  isSourceConnected,
  sourceFolderName,
  sourceFolderLink,
  onSourceLinkChange,
  onSaveSourceSettings,
  isExportFolderConnected,
  exportFolderName,
  exportFolderLink,
  onExportLinkChange,
  onSaveExportSettings,
}: DocumentKitSettingsDialogProps) {
  const [showSourceLinkDialog, setShowSourceLinkDialog] = useState(false)
  const [showExportLinkDialog, setShowExportLinkDialog] = useState(false)
  const handleSourceButtonClick = () => {
    setShowSourceLinkDialog(true)
  }

  const handleExportButtonClick = () => {
    setShowExportLinkDialog(true)
  }

  const handleSaveSourceLink = async () => {
    await onSaveSourceSettings()
    setShowSourceLinkDialog(false)
  }

  const handleSaveExportLink = async () => {
    await onSaveExportSettings()
    setShowExportLinkDialog(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Настройки набора документов</DialogTitle>
            <DialogDescription>
              Управление подключением папок Google Drive для источника и экспорта
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 py-4">
            {/* Левая колонка - Настройки источника */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Папка-источник документов</h3>

              <p className="text-xs text-muted-foreground">
                Откуда загружаются документы в раздел «Источник»
              </p>

              {/* Статус подключения */}
              <div className="flex items-center gap-2">
                {isSourceConnected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600 font-medium">Подключено</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Не подключено</span>
                  </>
                )}
              </div>

              {/* Название папки источника */}
              {isSourceConnected && sourceFolderName && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <Cloud className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{sourceFolderName}</span>
                </div>
              )}

              <Button onClick={handleSourceButtonClick} size="sm" className="w-full">
                {isSourceConnected ? 'Изменить источник' : 'Подключить источник'}
              </Button>
            </div>

            {/* Правая колонка - Настройки целевой папки */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Целевая папка для выгрузки</h3>

              <p className="text-xs text-muted-foreground">
                Куда выгружаются проверенные документы
              </p>

              {/* Статус подключения */}
              <div className="flex items-center gap-2">
                {isExportFolderConnected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600 font-medium">Подключено</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Не подключено</span>
                  </>
                )}
              </div>

              {/* Название целевой папки */}
              {isExportFolderConnected && exportFolderName && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <Cloud className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{exportFolderName}</span>
                </div>
              )}

              <Button onClick={handleExportButtonClick} size="sm" className="w-full">
                {isExportFolderConnected ? 'Изменить целевую папку' : 'Подключить целевую папку'}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог для ввода ссылки на папку-источник */}
      <Dialog open={showSourceLinkDialog} onOpenChange={setShowSourceLinkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isSourceConnected ? 'Изменить папку-источник' : 'Подключить папку-источник'}
            </DialogTitle>
            <DialogDescription>Откуда загружаются документы в раздел «Источник»</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source-link-input">Ссылка на папку Google Drive</Label>
              <Input
                id="source-link-input"
                placeholder="https://drive.google.com/drive/folders/..."
                value={sourceFolderLink}
                onChange={(e) => onSourceLinkChange(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t pt-4">
            <Button variant="outline" onClick={() => setShowSourceLinkDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveSourceLink} disabled={!sourceFolderLink.trim()}>
              Подключить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог для ввода ссылки на целевую папку */}
      <Dialog open={showExportLinkDialog} onOpenChange={setShowExportLinkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isExportFolderConnected ? 'Изменить целевую папку' : 'Подключить целевую папку'}
            </DialogTitle>
            <DialogDescription>Куда выгружаются проверенные документы</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="export-link-input">Ссылка на папку Google Drive</Label>
              <Input
                id="export-link-input"
                placeholder="https://drive.google.com/drive/folders/..."
                value={exportFolderLink}
                onChange={(e) => onExportLinkChange(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t pt-4">
            <Button variant="outline" onClick={() => setShowExportLinkDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveExportLink} disabled={!exportFolderLink.trim()}>
              Подключить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
