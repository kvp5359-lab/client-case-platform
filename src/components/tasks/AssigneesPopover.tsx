"use client"

/**
 * AssigneesPopover — попап выбора исполнителей с поиском и группировкой по
 * ролям (Сотрудники / Внешние / Клиенты). Один компонент на два сценария:
 *
 * 1. Thread-режим (по умолчанию): работает напрямую с тредом в БД.
 *    Требует `threadId`, `projectId`, `workspaceId`, `assignees` (превью
 *    для триггера). Клик по строке вызывает `useToggleAssignee` и сразу
 *    пишет в БД. Используется в TaskDialog, TaskRow, TaskPanel.
 *
 * 2. Controlled-режим: попап полностью контроллируемый. Требует
 *    `workspaceId`, `assigneeIds` (Set<string>), `onToggle` (коллбэк).
 *    Изменения хранятся в state родителя и сохраняются им самим при
 *    submit. Используется в ThreadTemplateDialog, где нет реального
 *    треда — только форма.
 */

import { useState, useMemo } from 'react'
import Image from 'next/image'
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
import { participantKeys } from '@/hooks/queryKeys'
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
    queryKey: participantKeys.projectFull(projectId),
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

// ── Props ──

/** Thread-режим: компонент сам пишет в БД через useToggleAssignee. */
interface ThreadModeProps {
  mode?: 'thread'
  threadId: string
  projectId: string | null
  workspaceId: string
  assignees: AvatarParticipant[]
  /** Задача в финальном статусе — аватарки отображаются тусклыми */
  dimmed?: boolean
}

/** Controlled-режим: state в родителе, компонент только рендерит и вызывает onToggle. */
interface ControlledModeProps {
  mode: 'controlled'
  workspaceId: string
  assigneeIds: Set<string>
  onToggle: (participantId: string) => void
  /** Список участников, если родитель грузит их сам. Если не передан —
   *  грузим через useWorkspaceParticipants(workspaceId). */
  participantsOverride?: WorkspaceParticipant[]
}

type AssigneesPopoverProps = ThreadModeProps | ControlledModeProps

export function AssigneesPopover(props: AssigneesPopoverProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const isControlled = props.mode === 'controlled'

  // ── Загрузка участников ──
  // Thread-режим: projectId → участники проекта, иначе логинящиеся участники workspace.
  // Controlled-режим: либо override из props, либо все участники workspace.
  const threadProjectId = !isControlled ? props.projectId : null
  const threadWorkspaceId = !isControlled ? props.workspaceId : null
  const controlledWorkspaceId = isControlled ? props.workspaceId : null

  const { data: projectParticipants = [] } = useProjectParticipants(
    open && threadProjectId ? threadProjectId : undefined,
  )
  const { data: workspaceMembers = [] } = useWorkspaceParticipants(
    open && !threadProjectId && (threadWorkspaceId || controlledWorkspaceId)
      ? (threadWorkspaceId ?? controlledWorkspaceId!)
      : undefined,
  )
  const loginableWorkspace = useMemo(
    () => workspaceMembers.filter((p) => p.can_login),
    [workspaceMembers],
  )

  const participants: WorkspaceParticipant[] = isControlled
    ? (props.participantsOverride ?? workspaceMembers)
    : threadProjectId
      ? projectParticipants
      : loginableWorkspace

  // ── Назначенные (разные источники в двух режимах) ──
  const assigneeSet = useMemo(() => {
    if (isControlled) return props.assigneeIds
    return new Set(props.assignees.map((a) => a.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled, isControlled ? props.assigneeIds : props.assignees])

  // ── Мутация (только в thread-режиме) ──
  // Хуки нельзя вызывать условно, поэтому дергаем всегда — передавая
  // пустой id в controlled-режиме. Мутация там никогда не вызывается.
  const toggleAssignee = useToggleAssignee(isControlled ? '' : props.threadId)

  const handleToggle = (participantId: string) => {
    if (isControlled) {
      props.onToggle(participantId)
      return
    }
    const assigned = assigneeSet.has(participantId)
    toggleAssignee.mutate({ participantId, assigned })
  }

  // ── Фильтрация и сортировка ──
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
        onClick={() => handleToggle(p.id)}
        disabled={!isControlled && toggleAssignee.isPending}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-1 text-left transition-colors',
          isAssigned ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/50',
        )}
      >
        {p.avatar_url ? (
          <Image
            src={p.avatar_url}
            alt=""
            width={24}
            height={24}
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
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

  // ── Trigger ──
  // Thread-режим: компактные аватарки задачи или иконка UserPlus.
  // Controlled-режим: полноценная кнопка с аватарками выбранных + подпись.
  const selectedList = isControlled
    ? participants.filter((p) => assigneeSet.has(p.id))
    : []

  const trigger = isControlled ? (
    <button
      type="button"
      className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background hover:bg-accent transition-colors text-sm font-normal w-full justify-start"
    >
      {selectedList.length === 0 ? (
        <span className="flex items-center gap-2 text-muted-foreground">
          <UserPlus className="w-4 h-4" />
          Назначить исполнителей
        </span>
      ) : (
        <>
          <span className="flex -space-x-1.5">
            {selectedList.slice(0, 3).map((p) =>
              p.avatar_url ? (
                <Image
                  key={p.id}
                  src={p.avatar_url}
                  alt=""
                  width={20}
                  height={20}
                  className="w-5 h-5 rounded-full object-cover ring-2 ring-background"
                />
              ) : (
                <span
                  key={p.id}
                  className="w-5 h-5 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-background"
                >
                  {(p.name ?? '?').charAt(0).toUpperCase()}
                </span>
              ),
            )}
          </span>
          <span className="text-foreground truncate">
            {selectedList.length === 1
              ? `${selectedList[0].name}${selectedList[0].last_name ? ' ' + selectedList[0].last_name : ''}`
              : `${selectedList.length} ${pluralizeAssignees(selectedList.length)}`}
          </span>
        </>
      )}
    </button>
  ) : (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 shrink-0 rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors',
        props.dimmed && 'opacity-20 hover:opacity-100',
      )}
      title="Исполнители"
      onClick={(e) => e.stopPropagation()}
    >
      {props.assignees.length > 0 ? (
        <ParticipantAvatars participants={props.assignees} maxVisible={3} />
      ) : (
        <span className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground">
          <UserPlus className="w-3.5 h-3.5" />
        </span>
      )}
    </button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setSearch('')
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align={isControlled ? 'start' : 'end'}
        onWheel={(e) => e.stopPropagation()}
      >
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

function pluralizeAssignees(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'исполнитель'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'исполнителя'
  return 'исполнителей'
}
