"use client"

/**
 * AssigneesPopover — попап выбора исполнителей задачи с поиском и группировкой по ролям.
 * Используется в TaskDialog и TaskRow.
 */

import { useState, useMemo } from 'react'
import { Check, UserPlus, Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  ParticipantAvatars,
  type AvatarParticipant,
} from '@/components/participants/ParticipantAvatars'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useToggleAssignee } from './useTaskAssignees'
import {
  useWorkspaceParticipants,
  type WorkspaceParticipant,
} from '@/hooks/shared/useWorkspaceParticipants'

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

function useProjectParticipants(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-participants-full', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select(
          'participant_id, participants!inner(id, name, last_name, avatar_url, is_deleted, can_login, user_id, workspace_roles)',
        )
        .eq('project_id', projectId!)
      if (error) throw error
      return (data ?? [])
        .map((pp) => pp.participants as unknown as WorkspaceParticipant & { is_deleted?: boolean })
        .filter((p) => !p.is_deleted)
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

interface AssigneesPopoverProps {
  threadId: string
  projectId: string | null
  workspaceId: string
  assignees: AvatarParticipant[]
}

export function AssigneesPopover({
  threadId,
  projectId,
  workspaceId,
  assignees,
}: AssigneesPopoverProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: projectParticipants = [] } = useProjectParticipants(
    open && projectId ? projectId : undefined,
  )
  const { data: workspaceMembers = [] } = useWorkspaceParticipants(
    open && !projectId ? workspaceId : undefined,
  )
  const loginableWorkspace = useMemo(
    () => workspaceMembers.filter((p) => p.can_login),
    [workspaceMembers],
  )
  const participants = projectId ? projectParticipants : loginableWorkspace
  const toggleAssignee = useToggleAssignee(threadId)

  // Используем assignees из props (они уже загружены батчем через useTaskAssigneesMap
  // в родительском компоненте) — вместо отдельного запроса на каждую строку задачи.
  const assigneeSet = useMemo(() => new Set(assignees.map((a) => a.id)), [assignees])

  const filtered = participants
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

  const staff = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'staff')
  const external = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'external')
  const clients = filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'client')

  const renderItem = (p: WorkspaceParticipant) => {
    const isAssigned = assigneeSet.has(p.id)
    const isMe = p.user_id === user?.id
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => toggleAssignee.mutate({ participantId: p.id, assigned: isAssigned })}
        disabled={toggleAssignee.isPending}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-1 text-left transition-colors',
          isAssigned ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50',
        )}
      >
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
            {(p.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm truncate flex-1">
          {isMe ? 'Я' : `${p.name}${p.last_name ? ` ${p.last_name}` : ''}`}
        </span>
        <div
          className={cn(
            'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
            isAssigned ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
          )}
        >
          {isAssigned && <Check className="w-3 h-3" />}
        </div>
      </button>
    )
  }

  const groups = [
    { items: staff, label: 'Сотрудники' },
    { items: external, label: 'Внешние сотрудники' },
    { items: clients, label: 'Клиенты' },
  ].filter((g) => g.items.length > 0)

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
          className="flex items-center gap-1 shrink-0 rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors"
          title="Исполнители"
          onClick={(e) => e.stopPropagation()}
        >
          {assignees.length > 0 ? (
            <ParticipantAvatars participants={assignees} maxVisible={3} />
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground">
              <UserPlus className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" onWheel={(e) => e.stopPropagation()}>
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
        <div className="max-h-[384px] overflow-y-auto py-1">
          {groups.map((g, i) => (
            <div key={g.label}>
              {i > 0 && <div className="border-t my-1" />}
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                {g.label}
              </p>
              {g.items.map(renderItem)}
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
