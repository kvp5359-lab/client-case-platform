/**
 * DraggableFolderRow — перетаскиваемая строка с папкой
 */

import { Button } from '@/components/ui/button'
import { NativeTableCell, NativeTableRow } from '@/components/ui/native-table'
import { GripVertical, Folder, Pencil, Trash2, FileText } from 'lucide-react'
import { KitFolder } from './types'

interface SlotInfo {
  id: string
  name: string
  sort_order: number
}

interface DraggableFolderRowProps {
  folder: KitFolder
  index: number
  slots?: SlotInfo[]
  isDragging: boolean
  isOver: boolean
  overPosition: 'top' | 'bottom'
  onDragStart: (e: React.DragEvent, folderId: string) => void
  onDragOver: (e: React.DragEvent, folderId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, folder: KitFolder) => void
  onDragEnd: () => void
  onEdit: (folder: KitFolder) => void
  onRemove: (folderId: string) => void
}

export function DraggableFolderRow({
  folder,
  index,
  slots = [],
  isDragging,
  isOver,
  overPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  onRemove,
}: DraggableFolderRowProps) {
  return (
    <>
      <NativeTableRow
        className={`group transition-colors ${
          isDragging
            ? 'opacity-40 bg-blue-50'
            : isOver
              ? overPosition === 'top'
                ? 'bg-blue-100 border-t-2 border-t-blue-500'
                : 'bg-blue-100 border-b-2 border-b-blue-500'
              : 'hover:bg-muted/30'
        }`}
        draggable
        onDragStart={(e) => onDragStart(e, folder.id)}
        onDragOver={(e) => onDragOver(e, folder.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, folder)}
        onDragEnd={onDragEnd}
      >
        <NativeTableCell>
          <div className="flex items-center justify-center">
            <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </NativeTableCell>
        <NativeTableCell>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{index}.</span>
              <Folder className="w-4 h-4 text-amber-500" />
              {folder.name}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(folder)}
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => onRemove(folder.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </NativeTableCell>
        <NativeTableCell>
          <span
            className="block truncate max-w-xs text-muted-foreground"
            title={folder.description || ''}
          >
            {folder.description || '—'}
          </span>
        </NativeTableCell>
      </NativeTableRow>
      {slots.length > 0 && (
        <NativeTableRow
          className={`!border-t-0 ${isDragging ? 'opacity-40 bg-blue-50' : ''}`}
          onDragOver={(e) => onDragOver(e, folder.id)}
          onDrop={(e) => onDrop(e, folder)}
        >
          <NativeTableCell />
          <NativeTableCell colSpan={2}>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 pb-1 pl-5">
              {slots.map((slot) => (
                <span
                  key={slot.id}
                  className="flex items-center gap-1 text-xs text-muted-foreground/60"
                >
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  {slot.name}
                </span>
              ))}
            </div>
          </NativeTableCell>
        </NativeTableRow>
      )}
    </>
  )
}
