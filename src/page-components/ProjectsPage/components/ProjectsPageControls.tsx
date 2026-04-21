import { Search, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ProjectPresetPopover,
  type ProjectPreset,
} from '@/components/projects/filters'

interface Props {
  preset: ProjectPreset
  filtersModified: boolean
  filtersOpen: boolean
  presetPopoverOpen: boolean
  onPresetPopoverChange: (open: boolean) => void
  onApplyPreset: (p: ProjectPreset) => void
  onToggleFilters: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onCreate: () => void
}

export function ProjectsPageControls({
  preset,
  filtersModified,
  filtersOpen,
  presetPopoverOpen,
  onPresetPopoverChange,
  onApplyPreset,
  onToggleFilters,
  searchQuery,
  onSearchChange,
  onCreate,
}: Props) {
  return (
    <div className={cn('flex items-center gap-2', filtersOpen ? 'mb-1.5' : 'mb-4')}>
      <ProjectPresetPopover
        preset={preset}
        filtersModified={filtersModified}
        filtersOpen={filtersOpen}
        presetPopoverOpen={presetPopoverOpen}
        onPresetPopoverChange={onPresetPopoverChange}
        onApplyPreset={onApplyPreset}
        onToggleFilters={onToggleFilters}
      />

      <div className="flex-1 flex items-center gap-2 border rounded-md px-3 h-9 bg-background">
        <Search className="h-4 w-4 text-gray-400 shrink-0" />
        <input
          type="text"
          placeholder="Поиск проектов..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="text-sm bg-transparent focus:outline-none w-full"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Очистить поиск"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={onCreate}>
        <Plus className="w-4 h-4 mr-1.5" />
        Создать проект
      </Button>
    </div>
  )
}
