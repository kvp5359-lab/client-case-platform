import { useRouter } from 'next/navigation'
import { ExternalLink, Calendar } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  ParticipantAvatars,
  type AvatarParticipant,
} from '@/components/participants/ParticipantAvatars'
import type { InboxThreadEntry } from '@/services/api/inboxService'

export function useProjectChatParticipants(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-participants-avatars', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_participants')
        .select('participant_id, participants!inner(id, name, last_name, avatar_url, is_deleted)')
        .eq('project_id', projectId!)

      if (error) throw error
      return (data ?? [])
        .map((pp) => pp.participants as unknown as AvatarParticipant & { is_deleted: boolean })
        .filter((p) => !p.is_deleted)
    },
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

interface InboxChatHeaderProps {
  chat: InboxThreadEntry
  workspaceId: string
  participants: AvatarParticipant[]
  toolbarRef: (el: HTMLDivElement | null) => void
}

/** Хедер правой панели: аватарки + кнопка проекта (слева) | toolbar portal (справа) */
export function InboxChatHeader({
  chat,
  workspaceId,
  participants,
  toolbarRef,
}: InboxChatHeaderProps) {
  const router = useRouter()

  // Загружаем deadline треда (для задач) отдельным запросом —
  // InboxThreadEntry приходит из RPC get_inbox_threads_v2, которая не возвращает deadline.
  // Добавить deadline в RPC = миграция БД. Отдельный запрос с staleTime=60s — приемлемый компромисс.
  const { data: threadData } = useQuery({
    queryKey: ['inbox-thread-detail', chat.thread_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_threads')
        .select('deadline')
        .eq('id', chat.thread_id)
        .single()
      return data
    },
    staleTime: 60_000,
  })

  const deadline = threadData?.deadline
    ? new Date(threadData.deadline).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      })
    : null

  return (
    <div className="relative flex items-center justify-between px-4 py-2 bg-muted/30 shrink-0">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-border via-border/40 to-transparent" />
      <div className="flex items-center gap-2.5 min-w-0">
        {/* 1. Проект */}
        <button
          type="button"
          onClick={() => router.push(`/workspaces/${workspaceId}/projects/${chat.project_id}`)}
          className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors shrink-0"
          title="Открыть проект"
        >
          <span className="font-semibold truncate max-w-[150px]">{chat.project_name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
        </button>

        <span className="text-muted-foreground/30">·</span>

        {/* 2. Название чата */}
        <span className="text-sm text-muted-foreground truncate max-w-[200px]">
          {chat.thread_name}
        </span>

        {/* 3. Срок (если есть) */}
        {deadline && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Calendar className="h-3 w-3" />
              {deadline}
            </span>
          </>
        )}

        {/* 4. Участники */}
        {participants.length > 0 && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <ParticipantAvatars participants={participants} />
          </>
        )}
      </div>
      {/* Правая часть: portal target для toolbar */}
      <div ref={toolbarRef} className="flex items-center gap-1 shrink-0" />
    </div>
  )
}
