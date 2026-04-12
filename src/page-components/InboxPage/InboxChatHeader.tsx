import { useRouter } from 'next/navigation'
import { MoreVertical, ExternalLink, Calendar, CheckSquare, MessageSquare, Mail } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  ParticipantAvatars,
  type AvatarParticipant,
} from '@/components/participants/ParticipantAvatars'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import { participantKeys, inboxThreadDetailKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { InboxThreadEntry } from '@/services/api/inboxService'
import type { ThreadTemplate } from '@/types/threadTemplate'

export function useProjectChatParticipants(projectId: string | undefined) {
  return useQuery({
    queryKey: participantKeys.projectAvatars(projectId),
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
    staleTime: STALE_TIME.STANDARD,
  })
}

const ACCENT_BG: Record<string, string> = {
  blue: 'bg-blue-500',
  slate: 'bg-stone-600',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-500',
  rose: 'bg-red-500',
  violet: 'bg-violet-600',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-600',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-600',
}

const THREAD_TYPES = [
  { tab: 'task' as const, label: 'Задача', icon: CheckSquare },
  { tab: 'chat' as const, label: 'Чат', icon: MessageSquare },
  { tab: 'email' as const, label: 'Email', icon: Mail },
] as const

interface InboxChatHeaderProps {
  chat: InboxThreadEntry
  workspaceId: string
  participants: AvatarParticipant[]
  toolbarRef: (el: HTMLDivElement | null) => void
  threadTemplates: ThreadTemplate[]
  onCreateThread: (defaultTab?: 'task' | 'chat' | 'email', template?: ThreadTemplate) => void
}

/** Хедер правой панели: аватарки + кнопка проекта (слева) | toolbar portal (справа) */
export function InboxChatHeader({
  chat,
  workspaceId,
  participants,
  toolbarRef,
  threadTemplates,
  onCreateThread,
}: InboxChatHeaderProps) {
  const router = useRouter()

  // Загружаем deadline треда (для задач) отдельным запросом —
  // InboxThreadEntry приходит из RPC get_inbox_threads_v2, которая не возвращает deadline.
  // Добавить deadline в RPC = миграция БД. Отдельный запрос с staleTime=60s — приемлемый компромисс.
  const { data: threadData } = useQuery({
    queryKey: inboxThreadDetailKeys.byThread(chat.thread_id),
    queryFn: async () => {
      const { data } = await supabase
        .from('project_threads')
        .select('deadline')
        .eq('id', chat.thread_id)
        .single()
      return data
    },
    staleTime: STALE_TIME.STANDARD,
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
        {/* 1. Проект + меню */}
        <span className="font-semibold text-sm truncate max-w-[150px]">{chat.project_name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="w-48">
            <DropdownMenuItem
              onClick={() =>
                router.push(`/workspaces/${workspaceId}/projects/${chat.project_id}`)
              }
            >
              <ExternalLink className="w-4 h-4 mr-2 text-muted-foreground" />
              Открыть проект
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CheckSquare className="w-4 h-4 mr-2 text-muted-foreground" />
                Новая задача
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {THREAD_TYPES.map((item) => (
                  <DropdownMenuItem
                    key={item.tab}
                    onClick={() => onCreateThread(item.tab)}
                  >
                    <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
                {threadTemplates.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {threadTemplates.map((t) => {
                      const IconComp = getChatIconComponent(t.icon)
                      return (
                        <DropdownMenuItem
                          key={t.id}
                          onClick={() =>
                            onCreateThread(
                              t.is_email ? 'email' : t.thread_type === 'task' ? 'task' : 'chat',
                              t,
                            )
                          }
                        >
                          <div
                            className={cn(
                              'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mr-2',
                              ACCENT_BG[t.accent_color ?? ''] ?? 'bg-muted',
                            )}
                          >
                            <IconComp className="w-3 h-3 text-white" />
                          </div>
                          <span className="truncate">{t.name}</span>
                        </DropdownMenuItem>
                      )
                    })}
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

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
