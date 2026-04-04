"use client"

/**
 * Диалог перемещения/дублирования документа в папку
 * Поддерживает группировку папок по наборам документов (tree-style)
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Folder {
  id: string
  name: string
}

export interface FolderGroup {
  kitId: string
  kitName: string
  folders: Folder[]
}

interface MoveDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: Folder[]
  folderGroups?: FolderGroup[]
  isMoving: boolean
  title?: string
  description?: string
  onMove: (folderId: string | null) => void
}

export function MoveDocumentDialog({
  open,
  onOpenChange,
  folders,
  folderGroups,
  isMoving,
  title = 'Переместить документ',
  description = 'Выберите группу, в которую хотите переместить документ',
  onMove,
}: MoveDocumentDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined)

  const handleMove = (folderId: string | null) => {
    setSelectedFolderId(folderId)
    onMove(folderId)
  }

  const handleOpenChange = (value: boolean) => {
    if (!value) setSelectedFolderId(undefined)
    onOpenChange(value)
  }

  const hasGroups = folderGroups && folderGroups.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="py-4 space-y-1">
            {/* Без группы */}
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
              onClick={() => handleMove(null)}
              disabled={isMoving}
            >
              {isMoving && selectedFolderId === null && (
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
              )}
              <span className="text-muted-foreground">Без группы</span>
            </button>

            {hasGroups
              ? folderGroups.map((group) => (
                  <div key={group.kitId} className="pt-2">
                    {/* Название набора */}
                    <div className="px-3 py-1.5 text-sm font-medium text-foreground">
                      {group.kitName}
                    </div>
                    {/* Папки с tree-линиями */}
                    <div className="ml-3">
                      {group.folders.map((folder, idx) => {
                        const isLast = idx === group.folders.length - 1
                        return (
                          <div key={folder.id} className="flex">
                            {/* Tree-коннектор */}
                            <div className="flex-shrink-0 w-5 flex justify-center">
                              <div className="relative w-full h-full">
                                {/* Вертикальная линия */}
                                <div
                                  className="absolute left-1/2 -translate-x-1/2 top-0 w-px bg-border"
                                  style={{ height: isLast ? '50%' : '100%' }}
                                />
                                {/* Горизонтальная ветка */}
                                <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-1/2 h-px bg-border" />
                              </div>
                            </div>
                            {/* Кнопка папки */}
                            <button
                              type="button"
                              className="flex-1 text-left px-2.5 py-0.5 rounded-md text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-2"
                              onClick={() => handleMove(folder.id)}
                              disabled={isMoving}
                            >
                              {isMoving && selectedFolderId === folder.id && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                              )}
                              {folder.name}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              : folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
                    onClick={() => handleMove(folder.id)}
                    disabled={isMoving}
                  >
                    {isMoving && selectedFolderId === folder.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                    )}
                    {folder.name}
                  </button>
                ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
