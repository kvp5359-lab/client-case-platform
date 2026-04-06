"use client"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Sparkles } from 'lucide-react'

interface BatchActionsAIProps {
  canBatchCheck: boolean
  selectedCount: number
  isProcessing: boolean
  onBatchCheck: () => void
}

/** Проверка документов AI */
export function BatchActionsAI({
  canBatchCheck,
  selectedCount,
  isProcessing,
  onBatchCheck,
}: BatchActionsAIProps) {
  if (!canBatchCheck) return null

  return (
    <>
      <DropdownMenuItem
        onClick={onBatchCheck}
        disabled={selectedCount === 0 || isProcessing}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Проверить документы
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}
