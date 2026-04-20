"use client"

/**
 * Фильтр проектов по участникам (клиент проекта или исполнители).
 */

import { useState, useMemo } from 'react'
import { Users } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { ParticipantAvatar } from '@/components/participants/ParticipantAvatar'
import { FilterToolbar, CheckItem, FilterButton } from '@/components/tasks/filters/FilterPrimitives'

export interface ProjectAssigneeOption {
  id: string
  name: string | null
  last_name?: string | null
  avatar_url?: string | null
}

interface ProjectAssigneeFilterProps {
  participants: ProjectAssigneeOption[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

export function ProjectAssigneeFilter({
  participants,
  selectedIds,
  onToggle,
  onClear,
}: ProjectAssigneeFilterProps) {
  const [open, setOpen] = useState(false)

  const sorted = useMemo(() => {
    return [...participants].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
  }, [participants])

  const selectedLabels = useMemo(
    () =>
      sorted
        .filter((p) => selectedIds.has(p.id))
        .map((p) => `${p.name ?? ''}${p.last_name ? ` ${p.last_name}` : ''}`),
    [sorted, selectedIds],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <FilterButton
            icon={Users}
            label="Участник"
            selectedLabels={selectedLabels}
            active={selectedIds.size > 0}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <FilterToolbar
          totalCount={sorted.length}
          selectedCount={selectedIds.size}
          onSelectAll={() => {
            for (const p of sorted) {
              if (!selectedIds.has(p.id)) onToggle(p.id)
            }
          }}
          onClear={onClear}
        />
        <div className="max-h-[280px] overflow-y-auto py-1">
          {sorted.map((p) => (
            <CheckItem key={p.id} checked={selectedIds.has(p.id)} onClick={() => onToggle(p.id)}>
              <ParticipantAvatar name={p.name ?? '?'} avatarUrl={p.avatar_url ?? null} size="md" />
              <span className="text-sm truncate flex-1">
                {`${p.name ?? ''}${p.last_name ? ` ${p.last_name}` : ''}`}
              </span>
            </CheckItem>
          ))}
          {sorted.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Нет участников</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
