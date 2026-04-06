"use client"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Eye, EyeOff } from 'lucide-react'

interface BatchActionsVisibilityProps {
  isSourceTab: boolean
  selectedSourceDocsAllHidden: boolean
  selectedCount: number
  isProcessing: boolean
  onBatchToggleHidden?: (hide: boolean) => void
}

/** Скрыть / показать документы (только для вкладки «Источник») */
export function BatchActionsVisibility({
  isSourceTab,
  selectedSourceDocsAllHidden,
  selectedCount,
  isProcessing,
  onBatchToggleHidden,
}: BatchActionsVisibilityProps) {
  if (!isSourceTab || !onBatchToggleHidden) return null

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => onBatchToggleHidden(!selectedSourceDocsAllHidden)}
        disabled={selectedCount === 0 || isProcessing}
      >
        {selectedSourceDocsAllHidden ? (
          <>
            <Eye className="h-4 w-4 mr-2" />
            Показать документы
          </>
        ) : (
          <>
            <EyeOff className="h-4 w-4 mr-2" />
            Скрыть документы
          </>
        )}
      </DropdownMenuItem>
    </>
  )
}
