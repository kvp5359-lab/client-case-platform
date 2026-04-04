/**
 * AddFoldersDialog — диалог добавления папок в набор
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Folder } from 'lucide-react'
import { FolderTemplate } from './types'

interface AddFoldersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableFolders: FolderTemplate[]
  isPending: boolean
  onSubmit: (folderIds: string[]) => void
}

export function AddFoldersDialog({
  open,
  onOpenChange,
  availableFolders,
  isPending,
  onSubmit,
}: AddFoldersDialogProps) {
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([])

  const handleToggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId],
    )
  }

  const handleSubmit = () => {
    if (selectedFolderIds.length === 0) return
    onSubmit(selectedFolderIds)
    setSelectedFolderIds([])
  }

  const handleClose = () => {
    onOpenChange(false)
    setSelectedFolderIds([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Добавить папки</DialogTitle>
          <DialogDescription>
            Выберите шаблоны папок, которые хотите добавить в набор
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {availableFolders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Нет доступных шаблонов папок</p>
              <p className="text-sm mt-2">Создайте шаблоны папок в разделе «Шаблоны папок»</p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {availableFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center gap-3 px-3 py-1.5 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleToggleFolderSelection(folder.id)}
                >
                  <Checkbox checked={selectedFolderIds.includes(folder.id)} />
                  <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{folder.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={selectedFolderIds.length === 0 || isPending}>
            {isPending ? 'Добавление...' : `Добавить (${selectedFolderIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
