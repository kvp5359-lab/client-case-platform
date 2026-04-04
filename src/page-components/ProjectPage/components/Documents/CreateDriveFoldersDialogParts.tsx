"use client"

/**
 * Подкомпоненты для CreateDriveFoldersDialog
 */

import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FolderOpen, Loader2, Check, ExternalLink, Copy, RotateCcw } from 'lucide-react'

// --- SelectedFolderBadge ---

interface SelectedFolderBadgeProps {
  folder: { id: string; name: string }
  onReset: () => void
}

export function SelectedFolderBadge({ folder, onReset }: SelectedFolderBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50/50 px-3 py-2">
      <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
      <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
      <button
        type="button"
        title="Открыть в Google Drive"
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/80 transition-colors"
        onClick={() =>
          window.open(
            `https://drive.google.com/drive/folders/${folder.id}`,
            '_blank',
            'noopener,noreferrer',
          )
        }
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Копировать ссылку"
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/80 transition-colors"
        onClick={() => {
          navigator.clipboard.writeText(`https://drive.google.com/drive/folders/${folder.id}`)
          toast.success('Ссылка скопирована')
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Изменить"
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/80 transition-colors"
        onClick={onReset}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// --- ExistingFoldersList ---

interface DriveFolder {
  id: string
  name: string
}

interface ExistingFoldersListProps {
  isLoading: boolean
  folders: DriveFolder[]
  selectedFolderId: string | null
  onSelect: (folder: DriveFolder) => void
}

export function ExistingFoldersList({
  isLoading,
  folders,
  selectedFolderId,
  onSelect,
}: ExistingFoldersListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загрузка папок...
      </div>
    )
  }

  if (folders.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Нет папок в папке проекта</p>
  }

  return (
    <div className="max-h-[150px] overflow-y-auto space-y-1 rounded-md border p-2">
      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          onClick={() => onSelect(folder)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors',
            selectedFolderId === folder.id
              ? 'bg-amber-50 text-foreground font-medium'
              : 'hover:bg-muted/50 text-muted-foreground',
          )}
        >
          <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{folder.name}</span>
          {selectedFolderId === folder.id && (
            <Check className="h-3.5 w-3.5 ml-auto text-amber-600 flex-shrink-0" />
          )}
        </button>
      ))}
    </div>
  )
}
