import { cn } from '@/lib/utils'
import { Toggle } from '@/components/ui/toggle'
import type { LucideIcon } from 'lucide-react'

interface ToolbarButtonProps {
  icon: LucideIcon
  isActive?: boolean
  disabled?: boolean
  title?: string
  onAction: () => void
}

// Bazovaya knopka paneli instrumentov (ispolzuet Toggle)
export function ToolbarButton({
  icon: Icon,
  isActive = false,
  disabled = false,
  title,
  onAction,
}: ToolbarButtonProps) {
  return (
    <Toggle
      size="sm"
      pressed={isActive}
      disabled={disabled}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        onAction()
      }}
    >
      <Icon className="h-4 w-4" />
    </Toggle>
  )
}

// Knopka bez Toggle sostoyaniya (prostaya)
export function ToolbarPlainButton({
  icon: Icon,
  isActive = false,
  disabled = false,
  title,
  onAction,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-2.5 min-w-9 transition-colors hover:bg-muted hover:text-muted-foreground disabled:opacity-50 disabled:pointer-events-none',
        isActive && 'bg-accent text-accent-foreground',
      )}
      onMouseDown={(e) => {
        e.preventDefault()
        onAction()
      }}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
