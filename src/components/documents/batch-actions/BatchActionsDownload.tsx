"use client"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Download } from 'lucide-react'

interface BatchActionsDownloadProps {
  canDownload: boolean
  selectedCount: number
  isProcessing: boolean
  onBatchDownload: () => void
}

/** Скачивание документов */
export function BatchActionsDownload({
  canDownload,
  selectedCount,
  isProcessing,
  onBatchDownload,
}: BatchActionsDownloadProps) {
  if (!canDownload) return null

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onBatchDownload}
        disabled={selectedCount === 0 || isProcessing}
      >
        <Download className="h-4 w-4 mr-2" />
        Скачать документы
      </DropdownMenuItem>
    </>
  )
}
