"use client"

/**
 * Диалог создания папок набора документов на Google Drive.
 *
 * Два этапа в одном окне:
 * 1. Целевая папка — создать новую / выбрать существующую / использовать корневую
 * 2. Подпапки — список секций набора, можно переименовать, кнопка «Создать подпапки»
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import { logger } from '@/utils/logger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import { SelectedFolderBadge, ExistingFoldersList } from './CreateDriveFoldersDialogParts'

type TargetMode = 'new' | 'existing' | 'root'

interface DriveFolder {
  id: string
  name: string
}

interface CreateDriveFoldersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kit: DocumentKitWithDocuments | null
  googleDriveFolderLink: string | null | undefined
  workspaceId: string
}

export function CreateDriveFoldersDialog({
  open,
  onOpenChange,
  kit,
  googleDriveFolderLink,
  workspaceId,
}: CreateDriveFoldersDialogProps) {
  const [targetMode, setTargetMode] = useState<TargetMode>('new')
  const [newFolderName, setNewFolderName] = useState('')
  const [existingFolders, setExistingFolders] = useState<DriveFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)
  const [folderNames, setFolderNames] = useState<string[]>([])
  const [targetFolder, setTargetFolder] = useState<{ id: string; name: string } | null>(null)
  const [isCreatingTarget, setIsCreatingTarget] = useState(false)
  const [isCreatingSubs, setIsCreatingSubs] = useState(false)

  const projectFolderId = googleDriveFolderLink
    ? extractGoogleDriveFolderId(googleDriveFolderLink)
    : null

  useEffect(() => {
    if (open && kit) {
      setNewFolderName(kit.name)
      setFolderNames((kit.folders || []).map((f, i) => `${i + 1}. ${f.name}`))
      setTargetMode('new')
      setSelectedFolderId(null)
      setExistingFolders([])
      setTargetFolder(null)
      setIsCreatingTarget(false)
      setIsCreatingSubs(false)
    }
  }, [open, kit])

  useEffect(() => {
    if (targetMode === 'existing' && projectFolderId && existingFolders.length === 0) {
      loadExistingFolders()
    }
  }, [targetMode, projectFolderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadExistingFolders = async () => {
    if (!projectFolderId) return
    setIsLoadingFolders(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: { action: 'list', workspaceId, folderId: projectFolderId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setExistingFolders(data?.folders || [])
    } catch (error) {
      logger.error('Failed to load folders:', error)
      toast.error('Не удалось загрузить список папок')
    } finally {
      setIsLoadingFolders(false)
    }
  }

  const handleCreateTargetFolder = async () => {
    if (!projectFolderId || !newFolderName.trim()) return
    setIsCreatingTarget(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: { workspaceId, parentFolderId: projectFolderId, folderName: newFolderName.trim() },
      })
      if (error) throw error
      if (data?.error) {
        toast.error(
          data.error === 'Google Drive not connected' ? 'Google Drive не подключён' : data.error,
        )
        return
      }
      setTargetFolder({ id: data.folderId, name: newFolderName.trim() })
      toast.success(`Папка «${newFolderName.trim()}» создана`)
    } catch (error) {
      logger.error('Failed to create target folder:', error)
      toast.error('Не удалось создать папку')
    } finally {
      setIsCreatingTarget(false)
    }
  }

  const handleSelectExisting = (folder: DriveFolder) => {
    setSelectedFolderId(folder.id)
    setTargetFolder({ id: folder.id, name: folder.name })
  }

  const handleUseRoot = () => {
    if (!projectFolderId) return
    setTargetFolder({ id: projectFolderId, name: 'Корневая папка проекта' })
  }

  const handleResetTarget = () => {
    setTargetFolder(null)
    setSelectedFolderId(null)
  }

  const handleFolderNameChange = (index: number, name: string) => {
    setFolderNames((prev) => {
      const next = [...prev]
      next[index] = name
      return next
    })
  }

  const handleCreateSubfolders = async () => {
    if (!targetFolder) return

    const validNames = folderNames.filter((n) => n.trim())
    if (validNames.length === 0) {
      toast.error('Нет папок для создания')
      return
    }

    setIsCreatingSubs(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: {
          action: 'batch',
          workspaceId,
          parentFolderId: targetFolder.id,
          subfolderNames: validNames,
        },
      })

      if (error) throw error
      if (data?.error) {
        toast.error(
          data.error === 'Google Drive not connected' ? 'Google Drive не подключён' : data.error,
        )
        return
      }

      toast.success(`Создано ${data?.created?.length || 0} подпапок`)
      onOpenChange(false)
    } catch (error) {
      logger.error('Failed to create subfolders:', error)
      toast.error('Не удалось создать подпапки')
    } finally {
      setIsCreatingSubs(false)
    }
  }

  if (!kit || !projectFolderId) return null

  const folders = kit.folders || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать папки на Google Drive</DialogTitle>
          <DialogDescription className="sr-only">
            Создание структуры папок набора документов на Google Drive
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Шаг 1: Целевая папка */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Целевая папка</Label>

            {targetFolder ? (
              <SelectedFolderBadge folder={targetFolder} onReset={handleResetTarget} />
            ) : (
              <>
                <div className="flex items-center gap-1 bg-muted/50 rounded-full p-1 w-fit">
                  {(['new', 'existing', 'root'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTargetMode(mode)}
                      className={cn(
                        'px-3 py-1.5 text-sm rounded-full transition-colors',
                        targetMode === mode
                          ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.35)] font-medium'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {mode === 'new' && 'Новая папка'}
                      {mode === 'existing' && 'Существующая'}
                      {mode === 'root' && 'В корень'}
                    </button>
                  ))}
                </div>

                {targetMode === 'new' && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Название папки"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleCreateTargetFolder}
                      disabled={!newFolderName.trim() || isCreatingTarget}
                    >
                      {isCreatingTarget ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
                    </Button>
                  </div>
                )}

                {targetMode === 'existing' && (
                  <ExistingFoldersList
                    isLoading={isLoadingFolders}
                    folders={existingFolders}
                    selectedFolderId={selectedFolderId}
                    onSelect={handleSelectExisting}
                  />
                )}

                {targetMode === 'root' && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">
                      Подпапки будут созданы прямо в папке проекта
                    </p>
                    <Button size="sm" variant="outline" onClick={handleUseRoot}>
                      Выбрать
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Шаг 2: Подпапки */}
          {folders.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Подпапки для создания ({folderNames.filter((n) => n.trim()).length})
              </Label>
              <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                {folders.map((folder, idx) => (
                  <Input
                    key={folder.id}
                    value={folderNames[idx] || ''}
                    onChange={(e) => handleFolderNameChange(idx, e.target.value)}
                    className="h-8 text-sm"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleCreateSubfolders}
            disabled={
              !targetFolder || isCreatingSubs || folderNames.filter((n) => n.trim()).length === 0
            }
          >
            {isCreatingSubs ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Создание...
              </>
            ) : (
              'Создать подпапки'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
