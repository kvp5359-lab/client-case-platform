"use client"

import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { CircleDot, CircleOff } from 'lucide-react'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { DocumentStatus } from '@/types/entities'

interface BatchActionsStatusProps {
  statuses: DocumentStatus[]
  selectedCount: number
  isProcessing: boolean
  onBatchSetStatus?: (statusId: string | null) => void
}

/** Установка статуса документов */
export function BatchActionsStatus({
  statuses,
  selectedCount,
  isProcessing,
  onBatchSetStatus,
}: BatchActionsStatusProps) {
  if (!onBatchSetStatus || statuses.length === 0) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={selectedCount === 0 || isProcessing}>
        <CircleDot className="h-4 w-4 mr-2" />
        Установить статус
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {statuses.map((status) => (
          <DropdownMenuItem key={status.id} onClick={() => onBatchSetStatus(status.id)}>
            <div
              className="w-3 h-3 rounded-full flex-shrink-0 mr-2"
              style={{ backgroundColor: safeCssColor(status.color) }}
            />
            {status.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onBatchSetStatus(null)}>
          <CircleOff className="h-4 w-4 mr-2 text-muted-foreground" />
          Без статуса
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
