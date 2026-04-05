/**
 * Диалог настроек доступа к чату.
 * Выбор типа: Все / Команда / Выборочно.
 * При "Выборочно" — список участников с toggle.
 */

import { useState, useCallback } from 'react'
import { MessageSquare, Users, UserCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { messengerKeys } from '@/hooks/queryKeys'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

interface Participant {
  id: string
  name: string
  last_name: string | null
  avatar_url: string | null
}

type AccessType = 'all' | 'roles' | 'custom'

const ACCESS_OPTIONS: {
  value: AccessType
  label: string
  desc: string
  icon: typeof MessageSquare
}[] = [
  { value: 'all', label: 'Все участники', desc: 'Клиент и команда', icon: MessageSquare },
  { value: 'roles', label: 'По ролям', desc: 'По ролям проекта', icon: Users },
  { value: 'custom', label: 'Выборочно', desc: 'Конкретные люди', icon: UserCheck },
]

/** Загрузить всех участников проекта */
function useProjectParticipants(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-participants', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select('participant_id, participants!inner(id, name, last_name, avatar_url, is_deleted)')
        .eq('project_id', projectId!)

      if (error) throw error
      return (data ?? [])
        .map((pp) => pp.participants as unknown as Participant)
        .filter((p) => !('is_deleted' in p && p.is_deleted))
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

/** Загрузить участников конкретного треда */
function useThreadMembers(threadId: string | undefined) {
  return useQuery({
    queryKey: ['thread-members', threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_thread_members')
        .select('participant_id')
        .eq('thread_id', threadId!)

      if (error) throw error
      return new Set((data ?? []).map((m) => m.participant_id))
    },
    enabled: !!threadId,
    staleTime: 30_000,
  })
}

interface ChatAccessDialogProps {
  chat: ProjectThread | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChatAccessDialog({ chat, open, onOpenChange }: ChatAccessDialogProps) {
  const queryClient = useQueryClient()
  const [localAccessType, setLocalAccessType] = useState<AccessType | null>(null)
  const accessType = localAccessType ?? chat?.access_type ?? 'all'

  // Синхронизация при смене чата
  const [prevChatId, setPrevChatId] = useState(chat?.id ?? '')
  if ((chat?.id ?? '') !== prevChatId) {
    setPrevChatId(chat?.id ?? '')
    setLocalAccessType(null)
  }

  const { data: participants = [] } = useProjectParticipants(chat?.project_id ?? undefined)
  const { data: memberIds = new Set<string>() } = useThreadMembers(
    accessType === 'custom' ? chat?.id : undefined,
  )

  // Мутация: сменить access_type
  const updateAccessMutation = useMutation({
    mutationFn: async (newAccess: AccessType) => {
      if (!chat) return
      const { error } = await supabase
        .from('project_threads')
        .update({ access_type: newAccess })
        .eq('id', chat.id)
      if (error) throw error
    },
    onSuccess: () => {
      if (chat)
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(chat.project_id ?? '') })
    },
  })

  // Мутация: toggle участника
  const toggleMemberMutation = useMutation({
    mutationFn: async ({ participantId, add }: { participantId: string; add: boolean }) => {
      if (!chat) return
      if (add) {
        const { error } = await supabase
          .from('project_thread_members')
          .insert({ thread_id: chat.id, participant_id: participantId })
        if (error && error.code !== '23505') throw error // ignore duplicate
      } else {
        const { error } = await supabase
          .from('project_thread_members')
          .delete()
          .eq('thread_id', chat.id)
          .eq('participant_id', participantId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      if (chat) queryClient.invalidateQueries({ queryKey: ['thread-members', chat.id] })
    },
  })

  const handleAccessChange = useCallback(
    (newAccess: AccessType) => {
      setLocalAccessType(newAccess)
      updateAccessMutation.mutate(newAccess)
    },
    [updateAccessMutation],
  )

  const handleToggleMember = useCallback(
    (participantId: string) => {
      const isCurrentMember = memberIds.has(participantId)
      toggleMemberMutation.mutate({ participantId, add: !isCurrentMember })
      // Optimistic: обновить кэш сразу
      queryClient.setQueryData(['thread-members', chat?.id], (old: Set<string> | undefined) => {
        const next = new Set(old ?? [])
        if (isCurrentMember) next.delete(participantId)
        else next.add(participantId)
        return next
      })
    },
    [memberIds, toggleMemberMutation, chat?.id, queryClient],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Доступ к чату «{chat?.name}»</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 py-2">
          {ACCESS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAccessChange(opt.value)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors',
                accessType === opt.value
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                  : 'hover:bg-muted/50 text-muted-foreground',
              )}
            >
              <opt.icon className="h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Список участников при "Выборочно" */}
        {accessType === 'custom' && (
          <div className="flex flex-col gap-1 pt-2 border-t max-h-[240px] overflow-y-auto">
            <div className="text-xs font-medium text-muted-foreground px-1 pb-1">
              Участники ({participants.filter((p) => memberIds.has(p.id)).length} из{' '}
              {participants.length})
            </div>
            {participants.map((p) => {
              const isMember = memberIds.has(p.id)
              const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleToggleMember(p.id)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    isMember
                      ? 'bg-primary/5 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                      {(p.name?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 text-left truncate">{fullName}</span>
                  <div
                    className={cn(
                      'h-4 w-4 rounded border-2 transition-colors shrink-0',
                      isMember ? 'bg-primary border-primary' : 'border-muted-foreground/30',
                    )}
                  >
                    {isMember && (
                      <svg viewBox="0 0 16 16" fill="none" className="h-full w-full text-white">
                        <path
                          d="M4 8l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
            {participants.length === 0 && (
              <div className="text-xs text-muted-foreground px-3 py-4 text-center">
                Нет участников в проекте
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
