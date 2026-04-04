/**
 * Task assignees popover for ChatSettingsDialog.
 */

import { useState } from 'react'
import { Users, Search, X, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Participant } from './chatSettingsTypes'
import { getRoleGroup } from './chatSettingsTypes'

interface ChatSettingsAssigneesProps {
  participants: Participant[]
  userId: string | undefined
  isEditMode: boolean
  /** Edit mode: current assignee IDs from DB */
  editAssigneeSet: Set<string>
  /** Create mode: local assignee IDs */
  taskAssignees: Set<string>
  /** Edit mode: toggle assignee mutation */
  onToggleEditAssignee: (params: { participantId: string; assigned: boolean }) => void
  /** Create mode: update local set */
  onSetTaskAssignees: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function ChatSettingsAssignees({
  participants,
  userId,
  isEditMode,
  editAssigneeSet,
  taskAssignees,
  onToggleEditAssignee,
  onSetTaskAssignees,
}: ChatSettingsAssigneesProps) {
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

  const staffA = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'staff')
  const externalA = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'external')
  const clientsA = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'client')
  const groups = [
    { items: staffA, label: 'Сотрудники' },
    { items: externalA, label: 'Внешние сотрудники' },
    { items: clientsA, label: 'Клиенты' },
  ].filter((g) => g.items.length > 0)

  const ids = isEditMode ? editAssigneeSet : taskAssignees

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm text-muted-foreground">Исполнители</Label>
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
            {ids.size === 0 ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4 shrink-0" />
                Выбрать исполнителей
              </span>
            ) : (
              participants
                .filter((pp) => ids.has(pp.id))
                .map((pp) => {
                  const isMe = pp.user_id === userId
                  return (
                    <span
                      key={pp.id}
                      className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-brand-100 text-xs font-medium"
                    >
                      {pp.avatar_url ? (
                        <img
                          src={pp.avatar_url}
                          alt=""
                          className="w-4 h-4 rounded-full object-cover"
                        />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                          {(pp.name?.[0] ?? '?').toUpperCase()}
                        </span>
                      )}
                      {isMe ? 'Я' : [pp.name, pp.last_name].filter(Boolean).join(' ')}
                    </span>
                  )
                })
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
            {groups.map((g, i) => (
              <div key={g.label}>
                {i > 0 && <div className="border-t my-1" />}
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  {g.label}
                </p>
                {g.items.map((p) => {
                  const isMe = p.user_id === userId
                  const isSel = isEditMode ? editAssigneeSet.has(p.id) : taskAssignees.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (isEditMode) {
                          onToggleEditAssignee({
                            participantId: p.id,
                            assigned: editAssigneeSet.has(p.id),
                          })
                        } else {
                          onSetTaskAssignees((prev) => {
                            const next = new Set(prev)
                            if (next.has(p.id)) next.delete(p.id)
                            else next.add(p.id)
                            return next
                          })
                        }
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-1 text-left transition-colors',
                        isSel ? 'bg-brand-50 hover:bg-brand-100' : 'hover:bg-muted/50',
                      )}
                    >
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                          {(p.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                      )}
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
    </div>
  )
}
