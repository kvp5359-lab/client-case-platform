"use client"

/**
 * Фильтр по сроку задач.
 */

import { useState, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { FilterToolbar, CheckItem, FilterButton } from './FilterPrimitives'

export type DeadlineFilterValue =
  | 'all'
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'later'
  | 'no_deadline'

const DEADLINE_FILTER_OPTIONS: { value: DeadlineFilterValue; label: string }[] = [
  { value: 'overdue', label: 'Просрочено' },
  { value: 'today', label: 'Сегодня' },
  { value: 'tomorrow', label: 'Завтра' },
  { value: 'this_week', label: 'На этой неделе' },
  { value: 'later', label: 'Позже' },
  { value: 'no_deadline', label: 'Без срока' },
]

interface DeadlineFilterProps {
  selectedValues: Set<DeadlineFilterValue>
  onToggle: (v: DeadlineFilterValue) => void
  onClear: () => void
}

export function DeadlineFilter({ selectedValues, onToggle, onClear }: DeadlineFilterProps) {
  const [open, setOpen] = useState(false)

  const selectedLabels = useMemo(
    () => DEADLINE_FILTER_OPTIONS.filter((o) => selectedValues.has(o.value)).map((o) => o.label),
    [selectedValues],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div>
          <FilterButton
            icon={Calendar}
            label="Срок"
            selectedLabels={selectedLabels}
            active={selectedValues.size > 0}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <FilterToolbar
          totalCount={DEADLINE_FILTER_OPTIONS.length}
          selectedCount={selectedValues.size}
          onSelectAll={() => {
            for (const opt of DEADLINE_FILTER_OPTIONS) {
              if (!selectedValues.has(opt.value)) onToggle(opt.value)
            }
          }}
          onClear={onClear}
        />
        <div className="py-1">
          {DEADLINE_FILTER_OPTIONS.map((opt) => (
            <CheckItem
              key={opt.value}
              checked={selectedValues.has(opt.value)}
              onClick={() => onToggle(opt.value)}
            >
              <span className="text-sm flex-1">{opt.label}</span>
            </CheckItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
