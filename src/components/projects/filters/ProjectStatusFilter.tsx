"use client"

/**
 * Фильтр по статусам проектов (active, paused, completed, archived).
 * Использует общие примитивы из tasks/filters для визуальной консистентности.
 */

import { useState, useMemo } from 'react'
import { CircleDot } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FilterToolbar, CheckItem, FilterButton } from '@/components/tasks/filters/FilterPrimitives'
import { PROJECT_STATUSES } from '@/page-components/ProjectPage/constants'

interface ProjectStatusFilterProps {
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

export function ProjectStatusFilter({ selectedIds, onToggle, onClear }: ProjectStatusFilterProps) {
  const [open, setOpen] = useState(false)

  const selectedLabels = useMemo(
    () => PROJECT_STATUSES.filter((s) => selectedIds.has(s.value)).map((s) => s.label),
    [selectedIds],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <FilterButton
            icon={CircleDot}
            label="Статус"
            selectedLabels={selectedLabels}
            active={selectedIds.size > 0}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <FilterToolbar
          totalCount={PROJECT_STATUSES.length}
          selectedCount={selectedIds.size}
          onSelectAll={() => {
            for (const s of PROJECT_STATUSES) {
              if (!selectedIds.has(s.value)) onToggle(s.value)
            }
          }}
          onClear={onClear}
        />
        <div className="py-1">
          {PROJECT_STATUSES.map((s) => (
            <CheckItem
              key={s.value}
              checked={selectedIds.has(s.value)}
              onClick={() => onToggle(s.value)}
            >
              <span className="text-sm truncate flex-1">{s.label}</span>
            </CheckItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
