/**
 * Empty state for AI chat panels.
 */

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AccentColor } from './ConversationTabsBar'

const accentBgClasses: Record<AccentColor, string> = {
  purple: 'bg-purple-600/10',
  orange: 'bg-orange-500/10',
  blue: 'bg-blue-500/10',
  green: 'bg-green-600/10',
}

const accentIconClasses: Record<AccentColor, string> = {
  purple: 'text-purple-600',
  orange: 'text-orange-500',
  blue: 'text-blue-500',
  green: 'text-green-600',
}

interface ChatEmptyStateProps {
  title: string
  description: string
  accent?: AccentColor
}

export function ChatEmptyState({ title, description, accent = 'purple' }: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 max-w-md px-4">
        <div
          className={cn(
            'mx-auto w-12 h-12 rounded-full flex items-center justify-center',
            accentBgClasses[accent],
          )}
        >
          <Sparkles className={cn('h-6 w-6', accentIconClasses[accent])} />
        </div>
        <h3 className="font-medium text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
