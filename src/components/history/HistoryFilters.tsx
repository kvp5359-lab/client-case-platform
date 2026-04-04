/**
 * Фильтры для вкладки «История»
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RESOURCE_TYPE_OPTIONS, ACTION_OPTIONS } from './ActivityItem'
import type { HistoryFilters as HistoryFiltersType } from '@/types/history'

interface HistoryFiltersProps {
  filters: HistoryFiltersType
  onFiltersChange: (filters: HistoryFiltersType) => void
}

export function HistoryFilters({ filters, onFiltersChange }: HistoryFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Фильтр по типу ресурса */}
      <Select
        value={filters.resourceTypes?.[0] ?? 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            resourceTypes: value === 'all' ? undefined : [value],
          })
        }
      >
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="Все ресурсы" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все ресурсы</SelectItem>
          {RESOURCE_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Фильтр по типу действия */}
      <Select
        value={filters.actions?.[0] ?? 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            actions: value === 'all' ? undefined : [value],
          })
        }
      >
        <SelectTrigger className="w-[200px] h-8 text-xs">
          <SelectValue placeholder="Все действия" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все действия</SelectItem>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
