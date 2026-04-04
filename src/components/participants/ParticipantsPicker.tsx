"use client"

/**
 * ParticipantsPicker — попап выбора участников с чипами, поиском и группировкой по ролям.
 * Единый компонент для задач (ChatSettingsDialog) и настроек проекта (ProjectParticipants).
 */

import { useState, useMemo } from 'react'
import { Check, Users, Search, X, Plus } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { ParticipantAvatar } from './ParticipantAvatar'

const STAFF_ROLES = ['Владелец', 'Администратор', 'Сотрудник']
const EXTERNAL_ROLES = ['Внешний сотрудник']
const CLIENT_ROLES = ['Клиент']

function getRoleGroup(roles?: string[]): 'staff' | 'external' | 'client' | 'other' {
  if (!roles) return 'other'
  if (roles.some((r) => STAFF_ROLES.includes(r))) return 'staff'
  if (roles.some((r) => EXTERNAL_ROLES.includes(r))) return 'external'
  if (roles.some((r) => CLIENT_ROLES.includes(r))) return 'client'
  return 'other'
}

export interface PickerParticipant {
  id: string
  name: string
  last_name?: string | null
  avatar_url?: string | null
  user_id?: string | null
  workspace_roles?: string[]
}

interface ParticipantsPickerProps {
  participants: PickerParticipant[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  onAddNew?: () => void
}

export function ParticipantsPicker({
  participants,
  selectedIds,
  onChange,
  placeholder = 'Выбрать участников',
  onAddNew,
}: ParticipantsPickerProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = useMemo(() => {
    return participants
      .filter((p) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return `${p.name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const aIsMe = a.user_id === user?.id
        const bIsMe = b.user_id === user?.id
        if (aIsMe && !bIsMe) return -1
        if (!aIsMe && bIsMe) return 1
        return (a.name ?? '').localeCompare(b.name ?? '', 'ru')
      })
  }, [participants, search, user?.id])

  const groups = useMemo(() => {
    const staff = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'staff')
    const external = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'external')
    const clients = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'client')
    return [
      { items: staff, label: 'Сотрудники' },
      { items: external, label: 'Внешние сотрудники' },
      { items: clients, label: 'Клиенты' },
    ].filter((g) => g.items.length > 0)
  }, [filtered])

  const toggleParticipant = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((sid) => sid !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const selectedParticipants = participants.filter((p) => selectedSet.has(p.id))

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm text-left hover:bg-muted/50 transition-colors min-h-[40px] flex-wrap"
        >
          {selectedParticipants.length === 0 ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4 shrink-0" />
              {placeholder}
            </span>
          ) : (
            selectedParticipants.map((pp) => {
              const isMe = pp.user_id === user?.id
              return (
                <span
                  key={pp.id}
                  className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-brand-100 text-xs font-medium"
                >
                  <ParticipantAvatar name={pp.name ?? '?'} avatarUrl={pp.avatar_url} size="sm" />
                  {isMe ? 'Я' : [pp.name, pp.last_name].filter(Boolean).join(' ')}
                </span>
              )
            })
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border rounded-md px-2 py-1 flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Поиск..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm bg-transparent focus:outline-none w-full"
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="shrink-0">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            {onAddNew && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onAddNew()
                }}
                className="shrink-0 w-7 h-7 flex items-center justify-center border rounded-md hover:bg-muted/50 transition-colors"
                title="Добавить нового участника"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {groups.map((g, i) => (
            <div key={g.label}>
              {i > 0 && <div className="border-t my-1" />}
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                {g.label}
              </p>
              {g.items.map((p) => {
                const isMe = p.user_id === user?.id
                const isSel = selectedSet.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleParticipant(p.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-1 text-left transition-colors',
                      isSel ? 'bg-brand-100 hover:bg-brand-200' : 'hover:bg-muted/50',
                    )}
                  >
                    <ParticipantAvatar name={p.name ?? '?'} avatarUrl={p.avatar_url} size="md" />
                    <span className="text-sm truncate flex-1">
                      {isMe ? 'Я' : [p.name, p.last_name].filter(Boolean).join(' ')}
                    </span>
                    <div
                      className={cn(
                        'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                        isSel
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      {isSel && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {search ? 'Никого не найдено' : 'Нет участников'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
