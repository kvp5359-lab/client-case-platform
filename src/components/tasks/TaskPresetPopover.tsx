"use client"

/**
 * Кнопка-попап выбора пресета фильтров задач + кнопка сворачивания фильтров.
 */

import { CheckSquare, Eye, Filter, ChevronDown, Check, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { PRESET_LABELS } from './taskListConstants'
import type { TaskPreset } from './useTaskFilters'

interface TaskPresetPopoverProps {
  preset: TaskPreset
  filtersModified: boolean
  filtersOpen: boolean
  presetPopoverOpen: boolean
  onPresetPopoverChange: (open: boolean) => void
  onApplyPreset: (p: TaskPreset) => void
  onToggleFilters: () => void
}

export function TaskPresetPopover({
  preset,
  filtersModified,
  filtersOpen,
  presetPopoverOpen,
  onPresetPopoverChange,
  onApplyPreset,
  onToggleFilters,
}: TaskPresetPopoverProps) {
  return (
    <div className="flex items-center shrink-0">
      <Popover open={presetPopoverOpen} onOpenChange={onPresetPopoverChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-9 px-2.5 flex items-center gap-1.5 rounded-l-md border border-r-0 border-input bg-background hover:bg-muted/50 transition-colors text-sm text-muted-foreground"
          >
            <Filter className="h-3.5 w-3.5" />
            {preset !== 'my_active' ? (
              <span className="inline-flex items-center gap-1 text-sm px-1.5 py-[3px] rounded bg-brand-100 text-brand-600 font-medium">
                {PRESET_LABELS[preset]}
                {filtersModified && <span className="text-muted-foreground font-normal">·</span>}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            ) : (
              <>
                <span>{PRESET_LABELS[preset]}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-0" align="start">
          <div className="py-1">
            {(['my_active', 'active', 'control', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onApplyPreset(p)
                  onPresetPopoverChange(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors',
                  preset === p && !filtersModified && 'font-medium text-foreground',
                )}
              >
                {p === 'my_active' && <UserCheck className="h-3.5 w-3.5 shrink-0" />}
                {p === 'active' && <CheckSquare className="h-3.5 w-3.5 shrink-0" />}
                {p === 'control' && <Eye className="h-3.5 w-3.5 shrink-0" />}
                {p === 'all' && <Filter className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1">{PRESET_LABELS[p]}</span>
                {preset === p && !filtersModified && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={onToggleFilters}
        className="h-9 w-7 flex items-center justify-center rounded-r-md border border-input bg-background text-muted-foreground hover:bg-muted/50 transition-colors"
        title={filtersOpen ? 'Скрыть фильтры' : 'Показать фильтры'}
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', filtersOpen && 'rotate-180')}
        />
      </button>
    </div>
  )
}
