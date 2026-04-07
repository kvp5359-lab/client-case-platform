"use client"

import { Kanban, Lock, Globe, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Board } from './types'

const ACCESS_ICONS = {
  workspace: Globe,
  private: Lock,
  custom: Users,
} as const

interface BoardCardProps {
  board: Board
  onClick: () => void
}

export function BoardCard({ board, onClick }: BoardCardProps) {
  const AccessIcon = ACCESS_ICONS[board.access_type]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg border p-4 text-left',
        'hover:bg-accent/50 transition-colors cursor-pointer',
      )}
    >
      <div className="flex items-center gap-2 w-full">
        <Kanban className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium truncate flex-1">{board.name}</span>
        <AccessIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      {board.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{board.description}</p>
      )}
    </button>
  )
}
