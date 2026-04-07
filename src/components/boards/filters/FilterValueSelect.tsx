"use client"

/**
 * Мультиселект для значений фильтра (статусы, проекты, участники).
 * Показывает выбранные значения в виде тегов (badges).
 */

import { useState, useMemo } from 'react'
import { X, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { PROJECT_STATUSES } from '@/page-components/ProjectPage/constants'
import type { FilterFieldDef } from '../types'

export interface FilterValueOption {
  id: string
  label: string
  color?: string
}

interface FilterValueSelectProps {
  fieldDef: FilterFieldDef
  value: unknown
  onChange: (value: string[]) => void
  workspaceId: string
  entityType: 'task' | 'project'
}

/** Хук: возвращает опции в зависимости от поля фильтра */
function useFieldOptions(
  fieldKey: string,
  workspaceId: string,
  entityType: 'task' | 'project',
): FilterValueOption[] {
  const { data: statuses } = useTaskStatuses(workspaceId)
  const { data: participants } = useWorkspaceParticipants(workspaceId)

  return useMemo(() => {
    switch (fieldKey) {
      case 'status_id': {
        const items: FilterValueOption[] = (statuses ?? []).map((s) => ({
          id: s.id,
          label: s.name,
          color: s.color,
        }))
        items.push({ id: '__no_status__', label: 'Без статуса', color: '#9CA3AF' })
        return items
      }
      case 'status': {
        return PROJECT_STATUSES.map((s) => ({
          id: s.value,
          label: s.label,
        }))
      }

      case 'type': {
        return [
          { id: 'task', label: 'Задача' },
          { id: 'chat', label: 'Чат' },
        ]
      }

      case 'created_by':
      case 'assignees':
      case 'participants': {
        const special: FilterValueOption[] = [
          { id: '__me__', label: 'Я' },
          ...(fieldKey === 'assignees' || fieldKey === 'participants'
            ? [{ id: '__creator__', label: 'Постановщик' }]
            : []),
        ]
        const people = (participants ?? [])
          .filter((p) => p.can_login)
          .map((p) => ({
            id: p.id,
            label: [p.name, p.last_name].filter(Boolean).join(' ') || p.email || p.id,
          }))
        return [...special, ...people]
      }

      default:
        return []
    }
  }, [fieldKey, entityType, statuses, participants])
}

/** Нормализует value в массив строк */
function normalizeValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}

export function FilterValueSelect({
  fieldDef,
  value,
  onChange,
  workspaceId,
  entityType,
}: FilterValueSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const options = useFieldOptions(fieldDef.key, workspaceId, entityType)
  const selectedIds = normalizeValue(value)

  const filteredOptions = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((v) => v !== id)
      : [...selectedIds, id]
    onChange(next)
  }

  const removeTag = (id: string) => {
    onChange(selectedIds.filter((v) => v !== id))
  }

  const selectedOptions = useMemo(
    () => options.filter((o) => selectedIds.includes(o.id)),
    [options, selectedIds],
  )

  // Нет опций — fallback на обычный текстовый ввод не нужен, просто покажем пустой селектор
  if (options.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          tabIndex={0}
          aria-expanded={open}
          className="flex items-center h-auto min-h-[32px] text-xs flex-1 min-w-[140px] justify-between px-2 py-1 border rounded-md bg-background cursor-pointer hover:bg-accent/50 transition-colors"
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedOptions.length === 0 && (
              <span className="text-muted-foreground">выбрать...</span>
            )}
            {selectedOptions.map((o) => (
              <Badge
                key={o.id}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 gap-1 max-w-[120px]"
              >
                {o.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: o.color }}
                  />
                )}
                <span className="truncate">{o.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-0.5 hover:text-destructive cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTag(o.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.stopPropagation(); removeTag(o.id) }
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </Badge>
            ))}
          </div>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        {/* Поиск */}
        {options.length > 5 && (
          <div className="p-2 border-b">
            <input
              className="w-full text-xs px-2 py-1 border rounded outline-none focus:ring-1 focus:ring-ring"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        )}
        {/* Список */}
        <div className="max-h-[240px] overflow-y-auto py-1">
          {filteredOptions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</div>
          )}
          {filteredOptions.map((o) => {
            const isSelected = selectedIds.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors',
                  isSelected && 'bg-accent/50',
                )}
                onClick={() => toggle(o.id)}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-4 h-4 rounded border shrink-0',
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30',
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                {o.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: o.color }}
                  />
                )}
                <span className="truncate flex-1">{o.label}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
