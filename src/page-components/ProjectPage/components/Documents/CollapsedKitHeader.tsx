"use client"

import { ChevronRight, MoreHorizontal, FileText } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CollapsedKitHeaderProps {
  kitName: string
  onToggle: () => void
  onGenerateSummary: () => void
}

export function CollapsedKitHeader({
  kitName,
  onToggle,
  onGenerateSummary,
}: CollapsedKitHeaderProps) {
  return (
    <div className="py-2 pr-2">
      <div
        className="flex items-center gap-3 pl-1 pr-3 pt-2 pb-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onToggle} className="flex items-center gap-2 group shrink-0">
          <h3 className="text-xl font-bold text-foreground uppercase tracking-wide text-left group-hover:underline">
            {kitName}
          </h3>
          <ChevronRight className="h-4 w-4 text-muted-foreground/70 transition-transform" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onGenerateSummary}>
              <FileText className="h-4 w-4 mr-2" />
              Сводка по документам
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
