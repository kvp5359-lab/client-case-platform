import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown, X } from 'lucide-react'
import { safeCssColor } from '@/utils/isValidCssColor'

export type FilterType = 'status' | 'group' | 'tag'

const FILTER_DEFS: Record<FilterType, { label: string }> = {
  status: { label: 'Статус' },
  group: { label: 'Группа' },
  tag: { label: 'Тег' },
}

interface FilterChipProps {
  type: FilterType
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  options: { id: string; name: string; color?: string }[]
  /** Кастомный контент попапа. Если передан — рендерится вместо дефолтного списка чекбоксов. */
  popoverContent?: React.ReactNode
  /** Ширина попапа (по умолчанию w-56) */
  popoverClassName?: string
}

export function FilterChip({
  type,
  selectedIds,
  onToggle,
  onClear,
  options,
  popoverContent,
  popoverClassName,
}: FilterChipProps) {
  const [open, setOpen] = useState(false)

  const selectedNames = options.filter((o) => selectedIds.includes(o.id)).map((o) => o.name)

  const label = FILTER_DEFS[type].label
  const hasSelection = selectedIds.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-0">
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center gap-1 text-xs h-6 px-2 border transition-colors ${
              hasSelection
                ? 'rounded-l-md bg-blue-50 border-blue-200 hover:bg-blue-100'
                : 'rounded-md bg-white hover:bg-gray-50'
            }`}
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium truncate max-w-[150px]">
              {selectedNames.length === 0 ? 'любой' : selectedNames.join(', ')}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        {hasSelection && (
          <button
            onClick={onClear}
            className="inline-flex items-center justify-center h-6 w-6 rounded-r-md border border-l-0 border-blue-200 bg-blue-50 hover:bg-red-50 transition-colors"
            title="Сбросить"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>
      <PopoverContent align="start" className={popoverClassName || 'w-56 p-2'}>
        {popoverContent || (
          <div className="space-y-0.5 max-h-60 overflow-auto">
            {options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedIds.includes(option.id)}
                  onCheckedChange={() => onToggle(option.id)}
                />
                {option.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: safeCssColor(option.color) }}
                  />
                )}
                <span className="text-sm truncate">{option.name}</span>
              </label>
            ))}
            {options.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">Нет вариантов</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
