"use client"

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Folder as FolderIcon, FolderInput } from 'lucide-react'
import type { Folder } from '../types'

interface BatchActionsMoveProps {
  canMove: boolean
  selectedCount: number
  isProcessing: boolean
  folders: Folder[]
  onBatchMove: (folderId: string | null) => void
}

/** Перемещение документов в папку */
export function BatchActionsMove({
  canMove,
  selectedCount,
  isProcessing,
  folders,
  onBatchMove,
}: BatchActionsMoveProps) {
  if (!canMove) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={selectedCount === 0 || isProcessing}>
        <FolderInput className="h-4 w-4 mr-2" />
        Переместить в папку
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {/* Опция "Нераспределённые" */}
        <DropdownMenuItem onClick={() => onBatchMove(null)}>
          <FolderIcon className="h-4 w-4 mr-2 text-muted-foreground" />
          Нераспределённые
        </DropdownMenuItem>

        {folders.length > 0 && <DropdownMenuSeparator />}

        {/* Список папок */}
        {folders.map((folder) => (
          <DropdownMenuItem key={folder.id} onClick={() => onBatchMove(folder.id)}>
            <FolderIcon className="h-4 w-4 mr-2 text-blue-600" />
            {folder.name}
          </DropdownMenuItem>
        ))}

        {folders.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Нет доступных папок
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
