"use client"

/**
 * Фильтр по проектам.
 */

import { useState, useMemo } from 'react'
import { FolderOpen } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FilterToolbar, CheckItem, FilterButton } from './FilterPrimitives'

interface ProjectFilterProps {
  projects: { id: string; name: string }[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

export function ProjectFilter({ projects, selectedIds, onToggle, onClear }: ProjectFilterProps) {
  const [open, setOpen] = useState(false)

  const selectedLabels = useMemo(
    () => projects.filter((p) => selectedIds.has(p.id)).map((p) => p.name),
    [projects, selectedIds],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <FilterButton
            icon={FolderOpen}
            label="Проект"
            selectedLabels={selectedLabels}
            active={selectedIds.size > 0}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <FilterToolbar
          totalCount={projects.length}
          selectedCount={selectedIds.size}
          onSelectAll={() => {
            for (const p of projects) {
              if (!selectedIds.has(p.id)) onToggle(p.id)
            }
          }}
          onClear={onClear}
        />
        <div className="max-h-[280px] overflow-y-auto py-1">
          {projects.map((p) => (
            <CheckItem key={p.id} checked={selectedIds.has(p.id)} onClick={() => onToggle(p.id)}>
              <span className="text-sm truncate flex-1">{p.name}</span>
            </CheckItem>
          ))}
          {projects.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Нет проектов</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
