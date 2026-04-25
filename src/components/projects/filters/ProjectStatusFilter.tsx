"use client"

/**
 * Фильтр по статусам проектов — читает все project-статусы воркспейса из БД
 * (`useAllProjectStatuses`), включая привязанные к шаблонам. Фильтр работает
 * по `status_id` (uuid). Дубликаты имён («Завершён» в нескольких шаблонах)
 * показываем подсказкой имени шаблона рядом — позже, пока без неё.
 */

import { useState, useMemo } from 'react'
import { CircleDot } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FilterToolbar, CheckItem, FilterButton } from '@/components/tasks/filters/FilterPrimitives'
import { useAllProjectStatuses } from '@/hooks/useStatuses'

interface ProjectStatusFilterProps {
  workspaceId: string
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

export function ProjectStatusFilter({
  workspaceId,
  selectedIds,
  onToggle,
  onClear,
}: ProjectStatusFilterProps) {
  const [open, setOpen] = useState(false)
  const { data: statuses = [] } = useAllProjectStatuses(workspaceId)

  const selectedLabels = useMemo(
    () => statuses.filter((s) => selectedIds.has(s.id)).map((s) => s.name),
    [statuses, selectedIds],
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
          totalCount={statuses.length}
          selectedCount={selectedIds.size}
          onSelectAll={() => {
            for (const s of statuses) {
              if (!selectedIds.has(s.id)) onToggle(s.id)
            }
          }}
          onClear={onClear}
        />
        <div className="py-1">
          {statuses.map((s) => (
            <CheckItem
              key={s.id}
              checked={selectedIds.has(s.id)}
              onClick={() => onToggle(s.id)}
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-sm truncate flex-1">{s.name}</span>
            </CheckItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
