"use client"

/**
 * Поле «Контакт» на вкладке «Настройки» проекта.
 *
 * Это бизнес-связка: про кого этот проект (см. ТЗ CRM-фрейма раздел 3).
 * Хранится в projects.contact_participant_id, ссылается на participants.
 * Не путать с «Клиенты» (project_participants с ролью CLIENT) — это про
 * доступ к ЛК.
 *
 * Поиск — по имени и любому каналу (email/phone/telegram) через
 * participant_channels. Single select: один проект — один контакт.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronDown, Search, X, UserCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ParticipantAvatar } from '@/components/participants/ParticipantAvatar'
import { projectKeys, STALE_TIME } from '@/hooks/queryKeys'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  workspaceId: string
  contactParticipantId: string | null
  disabled?: boolean
}

interface ContactCandidate {
  id: string
  name: string
  last_name: string | null
  avatar_url: string | null
  user_id: string | null
  workspace_roles: string[] | null
  // Каналы для поиска и подсказки
  channels: Array<{ channel_type: string; external_id: string }>
}

const PAGE_SIZE = 100

export function ProjectContactSection({
  projectId,
  workspaceId,
  contactParticipantId,
  disabled,
}: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Все participants воркспейса с их каналами — берём оптом, фильтруем на фронте.
  // Для воркспейса ≤ нескольких сотен это нормально; при росте перенесём на RPC.
  const { data: candidates = [] } = useQuery({
    queryKey: ['project-contact-candidates', workspaceId],
    queryFn: async (): Promise<ContactCandidate[]> => {
      const { data, error } = await supabase
        .from('participants')
        .select(
          'id, name, last_name, avatar_url, user_id, workspace_roles, ' +
            'participant_channels(channel_type, external_id)',
        )
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .limit(PAGE_SIZE * 5)
      if (error) throw error
      // PostgREST embedded select объединяет тип со внутренним GenericStringError,
      // в TS это даёт union — мы знаем что запрос валидный, кастуем явно.
      type Row = {
        id: string
        name: string
        last_name: string | null
        avatar_url: string | null
        user_id: string | null
        workspace_roles: string[] | null
        participant_channels: Array<{ channel_type: string; external_id: string }> | null
      }
      return ((data ?? []) as unknown as Row[]).map((row) => ({
        id: row.id,
        name: row.name,
        last_name: row.last_name,
        avatar_url: row.avatar_url,
        user_id: row.user_id,
        workspace_roles: row.workspace_roles,
        channels: row.participant_channels ?? [],
      }))
    },
    staleTime: STALE_TIME.STANDARD,
    enabled: !!workspaceId,
  })

  const selected = useMemo(
    () => (contactParticipantId ? candidates.find((c) => c.id === contactParticipantId) : null),
    [candidates, contactParticipantId],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return candidates.slice(0, PAGE_SIZE)
    return candidates
      .filter((c) => {
        const name = `${c.name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
        if (name.includes(q)) return true
        return c.channels.some((ch) => ch.external_id.toLowerCase().includes(q))
      })
      .slice(0, PAGE_SIZE)
  }, [candidates, search])

  const updateMut = useMutation({
    mutationFn: async (newId: string | null) => {
      const { error } = await supabase
        .from('projects')
        .update({ contact_participant_id: newId })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId) })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить контакт')
    },
  })

  function handlePick(id: string) {
    if (id === contactParticipantId) {
      setOpen(false)
      return
    }
    updateMut.mutate(id)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    updateMut.mutate(null)
  }

  return (
    <div className="max-w-3xl rounded-lg border p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold">Контакт</h3>
        {selected && !disabled && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <X className="size-3.5 mr-1" />
            Очистить
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Про кого этот проект. Не путай с «Клиенты» — это про доступ к ЛК.
      </p>

      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-2',
              'border rounded text-left text-sm',
              'hover:bg-muted/40 transition-colors',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {selected ? (
              <ContactRow contact={selected} compact />
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <UserCircle2 className="size-4" />
                Не выбран
              </span>
            )}
            <ChevronDown className="size-4 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[420px]" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск по имени или каналу"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Ничего не найдено
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePick(c.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50',
                    'border-b last:border-b-0',
                  )}
                >
                  <ContactRow contact={c} />
                  {c.id === contactParticipantId && (
                    <Check className="size-4 text-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ContactRow({ contact, compact }: { contact: ContactCandidate; compact?: boolean }) {
  const fullName = [contact.name, contact.last_name].filter(Boolean).join(' ') || 'Без имени'
  const primaryChannel = contact.channels[0]
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <ParticipantAvatar
        name={[contact.name, contact.last_name].filter(Boolean).join(' ')}
        avatarUrl={contact.avatar_url}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{fullName}</div>
        {!compact && primaryChannel && (
          <div className="text-xs text-muted-foreground truncate">
            {primaryChannel.channel_type}: {primaryChannel.external_id}
          </div>
        )}
      </div>
    </div>
  )
}
