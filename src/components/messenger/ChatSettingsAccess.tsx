/**
 * Access section popover for ChatSettingsDialog.
 * Supports three modes: all / roles / custom (individual participants).
 */

import { useState } from 'react'
import Image from 'next/image'
import { Users, Shield, Search, X, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Participant, AccessType } from './chatSettingsTypes'
import { getRoleGroup, PROJECT_ROLE_OPTIONS } from './chatSettingsTypes'

interface ChatSettingsAccessProps {
  participants: Participant[]
  userId: string | undefined
  isEditMode: boolean
  isTask: boolean
  accessType: AccessType
  /** Edit mode: member IDs from DB */
  memberIds: Set<string>
  /** Create mode: locally selected member IDs */
  selectedMemberIds: Set<string>
  /** Roles selected for 'roles' access type */
  selectedRoles: Set<string>
  onAccessChange: (newAccess: AccessType, roles?: string[]) => void
  onToggleMember: (participantId: string) => void
  /** Create mode setters */
  onSetAccessType: (t: AccessType) => void
  onSetSelectedMemberIds: React.Dispatch<React.SetStateAction<Set<string>>>
  onSetSelectedRoles: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function ChatSettingsAccess({
  participants,
  userId,
  isEditMode,
  isTask,
  accessType,
  memberIds,
  selectedMemberIds,
  selectedRoles,
  onAccessChange,
  onToggleMember,
  onSetAccessType,
  onSetSelectedMemberIds,
  onSetSelectedRoles,
}: ChatSettingsAccessProps) {
  const [search, setSearch] = useState('')

  const filtered = participants
    .filter((p) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return `${p.name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const aIsMe = a.user_id === userId
      const bIsMe = b.user_id === userId
      if (aIsMe && !bIsMe) return -1
      if (!aIsMe && bIsMe) return 1
      return (a.name ?? '').localeCompare(b.name ?? '', 'ru')
    })

  const staff = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'staff')
  const external = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'external')
  const clients = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'client')
  const groups = [
    { items: staff, label: 'Сотрудники' },
    { items: external, label: 'Внешние сотрудники' },
    { items: clients, label: 'Клиенты' },
  ].filter((g) => g.items.length > 0)

  const renderParticipant = (p: Participant) => {
    const isSelected = isEditMode ? memberIds.has(p.id) : selectedMemberIds.has(p.id)
    const isMe = p.user_id === userId
    const fullName = isMe ? 'Я' : [p.name, p.last_name].filter(Boolean).join(' ')
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => {
          if (isEditMode) {
            if (accessType !== 'custom') onAccessChange('custom')
            onToggleMember(p.id)
          } else {
            if (accessType !== 'custom') onSetAccessType('custom')
            onSetSelectedMemberIds((prev) => {
              const next = new Set(prev)
              if (next.has(p.id)) next.delete(p.id)
              else next.add(p.id)
              return next
            })
          }
        }}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-1 text-left transition-colors',
          isSelected ? 'bg-brand-100 hover:bg-brand-200' : 'hover:bg-muted/50',
        )}
      >
        {p.avatar_url ? (
          <Image src={p.avatar_url} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
            {(p.name?.[0] ?? '?').toUpperCase()}
          </div>
        )}
        <span className="text-sm truncate flex-1">{fullName}</span>
        <div
          className={cn(
            'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
            isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
          )}
        >
          {isSelected && <Check className="w-3 h-3" />}
        </div>
      </button>
    )
  }

  // Trigger button content
  const renderTriggerContent = () => {
    if (accessType === 'all') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand-100 text-brand-600 text-xs font-medium">
          <Users className="w-3 h-3" /> Все участники
        </span>
      )
    }
    if (accessType === 'roles') {
      if (selectedRoles.size === 0) {
        return (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Shield className="w-4 h-4 shrink-0" />
            Выбрать роли
          </span>
        )
      }
      return Array.from(selectedRoles).map((role) => {
        const opt = PROJECT_ROLE_OPTIONS.find((o) => o.value === role)
        return (
          <span
            key={role}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand-100 text-brand-600 text-xs font-medium"
          >
            <Shield className="w-3 h-3" /> {opt?.label ?? role}
          </span>
        )
      })
    }
    // custom
    const ids = isEditMode ? memberIds : selectedMemberIds
    if (ids.size === 0) {
      return (
        <span className="flex items-center gap-2 text-muted-foreground/40">
          <Users className="w-4 h-4 shrink-0" />
          Выбрать участников
        </span>
      )
    }
    const selected = participants.filter((pp) => ids.has(pp.id))
    return selected.map((pp) => (
      <span
        key={pp.id}
        className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-brand-100 text-xs font-medium"
      >
        {pp.avatar_url ? (
          <Image src={pp.avatar_url} alt="" width={16} height={16} className="w-4 h-4 rounded-full object-cover" />
        ) : (
          <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
            {(pp.name?.[0] ?? '?').toUpperCase()}
          </span>
        )}
        {pp.user_id === userId ? 'Я' : [pp.name, pp.last_name].filter(Boolean).join(' ')}
      </span>
    ))
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm text-muted-foreground">
        {isTask ? 'Кто видит задачу' : 'Кто видит чат'}
      </Label>
      <Popover
        onOpenChange={(v) => {
          if (!v) setSearch('')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm text-left hover:bg-muted/50 transition-colors min-h-[40px] flex-wrap"
          >
            {renderTriggerContent()}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          {/* Поиск */}
          <div className="px-3 py-2 border-b">
            <div className="flex items-center gap-2 border rounded-md px-2 py-1">
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
          </div>

          <div className="max-h-[300px] overflow-y-auto py-1">
            {/* Все участники */}
            {!search.trim() && (
              <button
                type="button"
                onClick={() => {
                  if (isEditMode) {
                    onAccessChange('all')
                  } else {
                    onSetAccessType('all')
                    onSetSelectedMemberIds(new Set())
                    onSetSelectedRoles(new Set())
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                  accessType === 'all' ? 'bg-brand-100 hover:bg-brand-200' : 'hover:bg-muted/50',
                )}
              >
                <Users className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">Все участники</span>
                <div
                  className={cn(
                    'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                    accessType === 'all'
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {accessType === 'all' && <Check className="w-3 h-3" />}
                </div>
              </button>
            )}

            {/* Роли проекта */}
            {!search.trim() && (
              <>
                <div className="border-t my-1" />
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  По ролям
                </p>
                {PROJECT_ROLE_OPTIONS.map((role) => {
                  const isActive = accessType === 'roles' && selectedRoles.has(role.value)
                  const roleMembers = participants
                    .filter((p) => p.project_roles?.includes(role.value))
                    .map((p) =>
                      p.user_id === userId ? 'Я' : [p.name, p.last_name].filter(Boolean).join(' '),
                    )
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedRoles)
                        if (next.has(role.value)) {
                          next.delete(role.value)
                        } else {
                          next.add(role.value)
                        }
                        onSetSelectedRoles(next)
                        if (next.size > 0) {
                          const rolesArr = Array.from(next)
                          if (isEditMode) {
                            onAccessChange('roles', rolesArr)
                          } else {
                            onSetAccessType('roles')
                            onSetSelectedMemberIds(new Set())
                          }
                        } else {
                          if (isEditMode) {
                            onAccessChange('all')
                          } else {
                            onSetAccessType('all')
                          }
                        }
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                        isActive ? 'bg-brand-100 hover:bg-brand-200' : 'hover:bg-muted/50',
                      )}
                    >
                      <Shield className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1 truncate">
                        {role.label}
                        {roleMembers.length > 0 && (
                          <span className="text-muted-foreground/50">
                            {' '}
                            ({roleMembers.join(', ')})
                          </span>
                        )}
                      </span>
                      <div
                        className={cn(
                          'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                          isActive
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-input',
                        )}
                      >
                        {isActive && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  )
                })}
              </>
            )}

            {/* Разделитель */}
            {groups.length > 0 && <div className="border-t my-1" />}

            {/* Участники по группам */}
            {groups.map((g, i) => (
              <div key={g.label}>
                {i > 0 && <div className="border-t my-1" />}
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  {g.label}
                </p>
                {g.items.map(renderParticipant)}
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
    </div>
  )
}
