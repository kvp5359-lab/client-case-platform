import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'

export function ColorDot({ color, className }: { color?: string; className?: string }) {
  return (
    <div
      className={cn('w-3 h-3 rounded-full flex-shrink-0', className)}
      style={{ backgroundColor: safeCssColor(color) }}
    />
  )
}
