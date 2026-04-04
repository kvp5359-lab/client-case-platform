"use client"

/**
 * Секция Google Drive в настройках проекта
 *
 * Диалог подключения папки: два режима
 * 1. Подключить существующую — вставить ссылку
 * 2. Создать новую — ввести название, папка создаётся в корневой папке шаблона проекта
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

type DialogMode = 'link' | 'create'

interface GoogleDriveSectionProps {
  // Данные
  googleDriveFolderLink: string | null | undefined
  folderName: string | null
  isLoadingFolderName: boolean

  // Диалог
  dialogOpen: boolean
  folderLink: string
  isSaving: boolean

  // Права
  canManageGoogleDrive: boolean

  // Корневая папка из шаблона (для создания подпапки)
  rootFolderId?: string | null

  // Название проекта (для дефолтного имени папки)
  projectName?: string

  // Действия
  onOpenDialog: () => void
  onCloseDialog: () => void
  onFolderLinkChange: (link: string) => void
  onSave: () => Promise<void>
  onCreateFolder?: (folderName: string) => Promise<void>
  onDisconnect: () => Promise<void>
}

export function GoogleDriveSection({
  googleDriveFolderLink,
  folderName,
  isLoadingFolderName,
  dialogOpen,
  folderLink,
  isSaving,
  canManageGoogleDrive,
  rootFolderId,
  projectName,
  onOpenDialog,
  onCloseDialog,
  onFolderLinkChange,
  onSave,
  onCreateFolder,
  onDisconnect,
}: GoogleDriveSectionProps) {
  const [dialogMode, setDialogMode] = useState<DialogMode>('link')
  const [newFolderName, setNewFolderName] = useState('')

  const hasCreateOption = !!rootFolderId && !!onCreateFolder

  const handleOpenDialog = () => {
    setDialogMode('link')
    setNewFolderName(projectName || '')
    onOpenDialog()
  }

  const handleClose = () => {
    setNewFolderName('')
    onCloseDialog()
  }

  const handleCreateFolder = async () => {
    if (!onCreateFolder || !newFolderName.trim()) return
    await onCreateFolder(newFolderName.trim())
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-sm font-medium">Google Drive</span>
            {googleDriveFolderLink ? (
              <>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div
                    className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0"
                    title="Папка подключена"
                  />
                  <span className="text-sm text-muted-foreground truncate" title={folderName || ''}>
                    {isLoadingFolderName ? 'Загрузка...' : folderName || 'Папка подключена'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => window.open(googleDriveFolderLink, '_blank')}
                >
                  Открыть папку
                </Button>
                {canManageGoogleDrive && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleOpenDialog}>
                        Изменить ссылку
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onDisconnect} className="text-destructive">
                        Отключить папку
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            ) : canManageGoogleDrive ? (
              <Button variant="outline" size="sm" onClick={handleOpenDialog}>
                Подключить папку
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">Не подключена</span>
            )}
          </div>
        </div>
      </div>

      {/* Диалог подключения папки */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подключить папку Google Drive</DialogTitle>
          </DialogHeader>

          {/* Переключатель режима — только если есть корневая папка */}
          {hasCreateOption && (
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
              <button
                type="button"
                onClick={() => setDialogMode('link')}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  dialogMode === 'link'
                    ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                По ссылке
              </button>
              <button
                type="button"
                onClick={() => setDialogMode('create')}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md transition-colors',
                  dialogMode === 'create'
                    ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Создать новую
              </button>
            </div>
          )}

          <div className="space-y-4 py-2">
            {dialogMode === 'link' ? (
              <div className="space-y-2">
                <Label htmlFor="folder-link">Ссылка на папку</Label>
                <Input
                  id="folder-link"
                  value={folderLink}
                  onChange={(e) => onFolderLinkChange(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
                <p className="text-xs text-muted-foreground">
                  Вставьте ссылку на существующую папку в Google Drive
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="folder-name">Название папки</Label>
                <Input
                  id="folder-name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Название проекта"
                />
                <p className="text-xs text-muted-foreground">
                  Новая папка будет создана в корневой папке проектов на Google Drive
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            {dialogMode === 'link' ? (
              <Button onClick={onSave} disabled={!folderLink.trim() || isSaving}>
                {isSaving ? 'Сохранение...' : 'Подключить'}
              </Button>
            ) : (
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isSaving}>
                {isSaving ? 'Создание...' : 'Создать'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
