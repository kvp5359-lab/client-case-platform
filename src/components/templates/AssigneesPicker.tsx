/**
 * Popover для выбора исполнителей из участников workspace.
 * Участники группируются по ролям: Сотрудники / Внешние / Клиенты / Прочие.
 * Используется в ThreadTemplateDialog (только для режима task).
 */

import { useMemo, useCallback } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, CheckSquare, X } from 'lucide-react'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'

// ── Role grouping constants ──

const STAFF_ROLES = ['Владелец', 'Администратор', 'Сотрудник']
const EXTERNAL_ROLES = ['Внешний сотрудник']
const CLIENT_ROLES = ['Клиент']

function getRoleGroup(roles?: string[] | null): 'staff' | 'external' | 'client' | 'other' {
  if (!roles) return 'other'
  if (roles.some((r) => STAFF_ROLES.includes(r))) return 'staff'
  if (roles.some((r) => EXTERNAL_ROLES.includes(r))) return 'external'
  if (roles.some((r) => CLIENT_ROLES.includes(r))) return 'client'
  return 'other'
}

// ── Props ──

interface AssigneesPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  participants: WorkspaceParticipant[]
  assigneeIds: Set<string>
  onToggle: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}

// ── Sub-components ──

function ParticipantItem({
  participant,
  checked,
  onToggle,
}: {
  participant: WorkspaceParticipant
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-left text-sm"
      onClick={onToggle}
    >
      <div
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
          checked ? 'bg-primary border-primary text-white' : 'border-gray-300',
        )}
      >
        {checked && <CheckSquare className="w-3 h-3" />}
      </div>
      <span className="truncate">
        {participant.name}
        {participant.last_name ? ` ${participant.last_name}` : ''}
      </span>
    </button>
  )
}

function ParticipantGroup({
  label,
  items,
  selectedSet,
  onToggle,
}: {
  label: string
  items: WorkspaceParticipant[]
  selectedSet: Set<string>
  onToggle: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">{label}</p>
      {items.map((p) => (
        <ParticipantItem
          key={p.id}
          participant={p}
          checked={selectedSet.has(p.id)}
          onToggle={() => onToggle(p.id)}
        />
      ))}
    </div>
  )
}

// ── Main component ──

export function AssigneesPicker({
  open,
  onOpenChange,
  participants,
  assigneeIds,
  onToggle,
  search,
  onSearchChange,
}: AssigneesPickerProps) {
  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = participants.filter((p) => {
      const fullName = `${p.name} ${p.last_name ?? ''}`.toLowerCase()
      return fullName.includes(q)
    })
    return {
      staff: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'staff'),
      external: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'external'),
      clients: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'client'),
      other: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'other'),
    }
  }, [participants, search])

  const handleToggle = useCallback(
    (id: string) => {
      onToggle(id)
    },
    [onToggle],
  )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start h-auto min-h-[36px] py-1.5">
          {assigneeIds.size > 0 ? (
            <div className="flex flex-wrap gap-1">
              {Array.from(assigneeIds).map((id) => {
                const p = participants.find((pp) => pp.id === id)
                if (!p) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 bg-muted rounded px-1.5 py-0.5 text-xs"
                  >
                    {p.name} {p.last_name?.[0]}.
                    <button
                      type="button"
                      className="hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggle(id)
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Выбрать исполнителей...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex items-center gap-1 mb-2 px-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск..."
            className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 p-0"
          />
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          <ParticipantGroup
            label="Сотрудники"
            items={grouped.staff}
            selectedSet={assigneeIds}
            onToggle={handleToggle}
          />
          <ParticipantGroup
            label="Внешние"
            items={grouped.external}
            selectedSet={assigneeIds}
            onToggle={handleToggle}
          />
          <ParticipantGroup
            label="Клиенты"
            items={grouped.clients}
            selectedSet={assigneeIds}
            onToggle={handleToggle}
          />
          <ParticipantGroup
            label="Прочие"
            items={grouped.other}
            selectedSet={assigneeIds}
            onToggle={handleToggle}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
