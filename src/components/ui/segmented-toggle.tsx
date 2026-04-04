import { cn } from '@/lib/utils'

export interface SegmentedToggleOption<T extends string> {
  value: T
  label: string
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center border border-brand-200 rounded-md overflow-hidden',
        className,
      )}
    >
      {options.map((option, i) => (
        <div key={option.value} className="contents">
          {i > 0 && <div className="w-px self-stretch bg-brand-200" />}
          <button
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'font-medium transition-colors',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-sm',
              value === option.value
                ? 'bg-brand-100 text-brand-600'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            {option.label}
          </button>
        </div>
      ))}
    </div>
  )
}
