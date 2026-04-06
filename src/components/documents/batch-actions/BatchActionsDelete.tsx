"use client"

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Trash2 } from 'lucide-react'

interface BatchActionsDeleteProps {
  canDelete: boolean
  selectedCount: number
  isProcessing: boolean
  hasTrashDocumentsSelected: boolean
  onBatchDelete: () => void
  onBatchHardDelete?: () => void
}

/** Удаление документов (мягкое и жёсткое) */
export function BatchActionsDelete({
  canDelete,
  selectedCount,
  isProcessing,
  hasTrashDocumentsSelected,
  onBatchDelete,
  onBatchHardDelete,
}: BatchActionsDeleteProps) {
  if (!canDelete) return null

  return (
    <>
      <DropdownMenuItem
        onClick={onBatchDelete}
        disabled={selectedCount === 0 || isProcessing}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Удалить файлы
      </DropdownMenuItem>
      {hasTrashDocumentsSelected && onBatchHardDelete && (
        <DropdownMenuItem
          onClick={onBatchHardDelete}
          disabled={selectedCount === 0 || isProcessing}
          className="text-destructive focus:text-destructive font-bold"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Удалить файлы навсегда
        </DropdownMenuItem>
      )}
    </>
  )
}
