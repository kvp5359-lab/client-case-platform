"use client"

/**
 * Кнопка-попап выбора пресета фильтров проектов + кнопка сворачивания фильтров.
 * Визуально копирует TaskPresetPopover.
 */

import { Filter, ChevronDown, Check, CheckSquare, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

export type ProjectPreset = 'active' | 'completed' | 'all'

export const PROJECT_PRESET_LABELS: Record<ProjectPreset, string> = {
  active: 'Активные',
  completed: 'Завершённые',
  all: 'Все проекты',
}

interface ProjectPresetPopoverProps {
  preset: ProjectPreset
  filtersModified: boolean
  filtersOpen: boolean
  presetPopoverOpen: boolean
  onPresetPopoverChange: (open: boolean) => void
  onApplyPreset: (p: ProjectPreset) => void
  onToggleFilters: () => void
}

export function ProjectPresetPopover({
  preset,
  filtersModified,
  filtersOpen,
  presetPopoverOpen,
  onPresetPopoverChange,
  onApplyPreset,
  onToggleFilters,
}: ProjectPresetPopoverProps) {
  return (
    <div className="flex items-center shrink-0">
      <Popover open={presetPopoverOpen} onOpenChange={onPresetPopoverChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-9 px-2.5 flex items-center gap-1.5 rounded-l-md border border-r-0 border-input bg-background hover:bg-muted/50 transition-colors text-sm text-muted-foreground"
          >
            <Filter className="h-3.5 w-3.5" />
            {preset !== 'active' ? (
              <span className="inline-flex items-center gap-1 text-sm px-1.5 py-[3px] rounded bg-brand-100 text-brand-600 font-medium">
                {PROJECT_PRESET_LABELS[preset]}
                {filtersModified && <span className="text-muted-foreground font-normal">·</span>}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            ) : (
              <>
                <span>{PROJECT_PRESET_LABELS[preset]}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-0" align="start">
          <div className="py-1">
            {(['active', 'completed', 'all'] as const).map((p) => (
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
                {p === 'active' && <CheckSquare className="h-3.5 w-3.5 shrink-0" />}
                {p === 'completed' && <Flag className="h-3.5 w-3.5 shrink-0" />}
                {p === 'all' && <Filter className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1">{PROJECT_PRESET_LABELS[p]}</span>
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
