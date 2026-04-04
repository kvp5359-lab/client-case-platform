"use client"

/**
 * Фильтр по статусам задач.
 */

import { useState, useMemo } from 'react'
import { CircleDot } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FilterToolbar, CheckItem, FilterButton } from './FilterPrimitives'

interface StatusFilterProps {
  statuses: { id: string; name: string; color: string; is_final: boolean }[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
}

export function StatusFilter({ statuses, selectedIds, onToggle, onClear }: StatusFilterProps) {
  const [open, setOpen] = useState(false)

  const options = useMemo(() => {
    const items = statuses.map((s) => ({
      id: s.id,
      label: s.name,
      color: s.color,
      isFinal: s.is_final,
    }))
    items.push({ id: '__no_status__', label: 'Без статуса', color: '#9CA3AF', isFinal: false })
    return items
  }, [statuses])

  const selectedLabels = useMemo(
    () => options.filter((o) => selectedIds.has(o.id)).map((o) => o.label),
    [options, selectedIds],
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
          totalCount={options.length}
          selectedCount={selectedIds.size}
          onSelectAll={() => {
            for (const o of options) {
              if (!selectedIds.has(o.id)) onToggle(o.id)
            }
          }}
          onClear={onClear}
        />
        <div className="max-h-[280px] overflow-y-auto py-1">
          {options.map((o) => (
            <CheckItem key={o.id} checked={selectedIds.has(o.id)} onClick={() => onToggle(o.id)}>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: o.color }}
              />
              <span className="text-sm truncate flex-1">{o.label}</span>
            </CheckItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
