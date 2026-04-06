"use client"

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Merge, FileArchive } from 'lucide-react'

interface BatchActionsMergeProps {
  selectedCount: number
  isProcessing: boolean
  canCompress: boolean
  onMerge: () => void
  onBatchCompress: () => void
}

/** Объединение файлов + сжатие PDF */
export function BatchActionsMerge({
  selectedCount,
  isProcessing,
  canCompress,
  onMerge,
  onBatchCompress,
}: BatchActionsMergeProps) {
  return (
    <>
      <DropdownMenuItem onClick={onMerge} disabled={selectedCount < 2 || isProcessing}>
        <Merge className="h-4 w-4 mr-2" />
        Объединить файлы
        {selectedCount < 2 && (
          <span className="ml-2 text-xs text-muted-foreground">(мин. 2)</span>
        )}
      </DropdownMenuItem>

      {canCompress && (
        <DropdownMenuItem
          onClick={onBatchCompress}
          disabled={selectedCount === 0 || isProcessing}
        >
          <FileArchive className="h-4 w-4 mr-2" />
          Сжать PDF
        </DropdownMenuItem>
      )}
    </>
  )
}
