"use client"

/**
 * Фильтр проектов по шаблону.
 */

import { useState, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FilterToolbar, CheckItem, FilterButton } from '@/components/tasks/filters/FilterPrimitives'

export interface ProjectTemplateOption {
  id: string
  name: string
}

interface ProjectTemplateFilterProps {
  templates: ProjectTemplateOption[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

const NO_TEMPLATE_ID = '__no_template__'

export function ProjectTemplateFilter({
  templates,
  selectedIds,
  onToggle,
  onClear,
}: ProjectTemplateFilterProps) {
  const [open, setOpen] = useState(false)

  const options = useMemo<ProjectTemplateOption[]>(
    () => [...templates, { id: NO_TEMPLATE_ID, name: 'Без шаблона' }],
    [templates],
  )

  const selectedLabels = useMemo(
    () => options.filter((t) => selectedIds.has(t.id)).map((t) => t.name),
    [options, selectedIds],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <FilterButton
            icon={FileText}
            label="Шаблон"
            selectedLabels={selectedLabels}
            active={selectedIds.size > 0}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <FilterToolbar
          totalCount={options.length}
          selectedCount={selectedIds.size}
          onSelectAll={() => {
            for (const t of options) {
              if (!selectedIds.has(t.id)) onToggle(t.id)
            }
          }}
          onClear={onClear}
        />
        <div className="max-h-[280px] overflow-y-auto py-1">
          {options.map((t) => (
            <CheckItem key={t.id} checked={selectedIds.has(t.id)} onClick={() => onToggle(t.id)}>
              <span className="text-sm truncate flex-1">{t.name}</span>
            </CheckItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { NO_TEMPLATE_ID }
