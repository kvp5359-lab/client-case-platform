"use client"

/**
 * Фильтр по исполнителям задач.
 */

import { useState, useMemo } from 'react'
import { Users } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { ParticipantAvatar } from '@/components/participants/ParticipantAvatar'
import { FilterToolbar, CheckItem, FilterButton } from './FilterPrimitives'

interface AssigneeFilterProps {
  allAssignees: AvatarParticipant[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
  currentParticipantId: string | null
}

export function AssigneeFilter({
  allAssignees,
  selectedIds,
  onToggle,
  onClear,
  currentParticipantId,
}: AssigneeFilterProps) {
  const [open, setOpen] = useState(false)

  const sorted = useMemo(() => {
    const copy = [...allAssignees]
    copy.sort((a, b) => {
      if (a.id === currentParticipantId) return -1
      if (b.id === currentParticipantId) return 1
      return (a.name ?? '').localeCompare(b.name ?? '', 'ru')
    })
    return copy
  }, [allAssignees, currentParticipantId])

  const selectedLabels = useMemo(() => {
    return sorted
      .filter((p) => selectedIds.has(p.id))
      .map((p) =>
        p.id === currentParticipantId
          ? 'Я'
          : `${p.name ?? ''}${p.last_name ? ` ${p.last_name}` : ''}`,
      )
  }, [sorted, selectedIds, currentParticipantId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <FilterButton
            icon={Users}
            label="Исполнитель"
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
          {sorted.map((p) => {
            const isMe = p.id === currentParticipantId
            return (
              <CheckItem key={p.id} checked={selectedIds.has(p.id)} onClick={() => onToggle(p.id)}>
                <ParticipantAvatar name={p.name ?? '?'} avatarUrl={p.avatar_url} size="md" />
                <span className="text-sm truncate flex-1">
                  {isMe
                    ? 'Я исполнитель'
                    : `${p.name ?? ''}${p.last_name ? ` ${p.last_name}` : ''}`}
                </span>
              </CheckItem>
            )
          })}
          {sorted.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Нет исполнителей</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
