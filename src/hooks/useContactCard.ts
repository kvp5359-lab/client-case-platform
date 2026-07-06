"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import {
  contactThreadKeys,
  invalidateAfterThreadMove,
  participantKeys,
  STALE_TIME,
} from '@/hooks/queryKeys'

export type ContactParticipant = {
  id: string
  workspace_id: string
  user_id: string | null
  name: string
  last_name: string | null
  email: string
  phone: string | null
  telegram_user_id: number | null
  telegram_username: string | null
  avatar_url: string | null
  notes: string | null
  can_login: boolean
  workspace_roles: string[]
}

export type ContactThread = {
  id: string
  name: string
  type: string
  icon: string
  accent_color: string
  channel: string
  project_id: string | null
  project_name: string | null
  last_message_at: string | null
}

export function useContactParticipant(participantId: string | null | undefined) {
  return useQuery<ContactParticipant | null>({
    queryKey: participantKeys.byId(participantId ?? ''),
    queryFn: async () => {
      if (!participantId) return null
      const { data, error } = await supabase
        .from('participants')
        .select('id, workspace_id, user_id, name, last_name, email, phone, telegram_user_id, telegram_username, avatar_url, notes, can_login, workspace_roles')
        .eq('id', participantId)
        .maybeSingle()
      if (error) throw error
      return (data as ContactParticipant | null) ?? null
    },
    enabled: !!participantId,
    staleTime: STALE_TIME.STANDARD,
  })
}

export function useContactThreads(participantId: string | null | undefined) {
  return useQuery<ContactThread[]>({
    queryKey: contactThreadKeys.byParticipant(participantId ?? ''),
    queryFn: async () => {
      if (!participantId) return []
      const { data, error } = await supabase
        .from('project_threads')
        .select(`
          id, name, type, icon, accent_color, project_id, business_connection_id,
          mtproto_session_user_id, wazzup_chat_id, email_subject_root,
          updated_at, projects(name)
        `)
        .eq('contact_participant_id', participantId)
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((t) => {
        const tt = t as unknown as {
          id: string; name: string; type: string; icon: string; accent_color: string
          project_id: string | null
          business_connection_id: string | null
          mtproto_session_user_id: string | null
          wazzup_chat_id: string | null
          email_subject_root: string | null
          updated_at: string
          projects: { name: string } | null
        }
        const channel: string = tt.business_connection_id
          ? 'telegram_business'
          : tt.mtproto_session_user_id
            ? 'telegram_mtproto'
            : tt.wazzup_chat_id
              ? 'wazzup'
              : tt.email_subject_root || tt.type === 'email'
                ? 'email'
                : 'other'
        return {
          id: tt.id,
          name: tt.name,
          type: tt.type,
          icon: tt.icon,
          accent_color: tt.accent_color,
          channel,
          project_id: tt.project_id,
          project_name: tt.projects?.name ?? null,
          last_message_at: tt.updated_at,
        }
      })
    },
    enabled: !!participantId,
    staleTime: STALE_TIME.SHORT,
  })
}

export type DirectChatThread = {
  id: string
  name: string
  channel: 'telegram_mtproto' | 'telegram_business'
}

/**
 * Прямой личный чат (MTProto / Telegram Business) с этим участником.
 *
 * Связка идёт по ЧИСЛОВОМУ telegram_user_id (его хранят треды —
 * `mtproto_client_tg_user_id` / `business_client_tg_user_id`). Если у карточки
 * числовой id пуст — best-effort по нику: ищем участника-контакта с таким же
 * `telegram_username` (он несёт числовой id) и матчим тред по нему. Username на
 * самих тредах не хранится, поэтому без числового id матч возможен только когда
 * ник совпал с сохранённым ником контакта. RLS сам ограничит выдачу личных
 * диалогов (владелец + менеджеры) — «мой чат» подтянется, чужой приватный нет.
 */
export function useDirectChatThreads(contact: ContactParticipant | null | undefined) {
  return useQuery<DirectChatThread[]>({
    queryKey: [
      'contact-direct-chat',
      contact?.id ?? '',
      contact?.telegram_user_id ?? null,
      contact?.telegram_username ?? null,
    ],
    queryFn: async () => {
      if (!contact) return []
      const ids = new Set<number>()
      if (contact.telegram_user_id) {
        // Приоритет — числовой id.
        ids.add(contact.telegram_user_id)
      } else if (contact.telegram_username) {
        // Fallback — ник: резолвим в числовой id через участника-контакта.
        const uname = contact.telegram_username.replace(/^@/, '')
        const { data, error } = await supabase
          .from('participants')
          .select('telegram_user_id')
          .eq('workspace_id', contact.workspace_id)
          .ilike('telegram_username', uname)
          .not('telegram_user_id', 'is', null)
        if (error) throw error
        for (const r of (data ?? []) as { telegram_user_id: number | null }[]) {
          if (r.telegram_user_id) ids.add(r.telegram_user_id)
        }
      }
      if (ids.size === 0) return []
      const list = [...ids].join(',')
      const { data: threads, error } = await supabase
        .from('project_threads')
        .select('id, name, mtproto_client_tg_user_id, business_client_tg_user_id')
        .eq('workspace_id', contact.workspace_id)
        .eq('is_deleted', false)
        .or(`mtproto_client_tg_user_id.in.(${list}),business_client_tg_user_id.in.(${list})`)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (threads ?? []).map((t) => {
        const tt = t as unknown as {
          id: string
          name: string
          mtproto_client_tg_user_id: number | null
          business_client_tg_user_id: number | null
        }
        return {
          id: tt.id,
          name: tt.name,
          channel: tt.business_client_tg_user_id
            ? ('telegram_business' as const)
            : ('telegram_mtproto' as const),
        }
      })
    },
    enabled: !!contact && (!!contact?.telegram_user_id || !!contact?.telegram_username),
    staleTime: STALE_TIME.SHORT,
  })
}

export function useRenameParticipant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      participantId,
      name,
      lastName,
    }: {
      participantId: string
      name: string
      lastName: string | null
    }) => {
      const { error } = await supabase
        .from('participants')
        .update({ name, last_name: lastName })
        .eq('id', participantId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: participantKeys.byId(vars.participantId) })
      qc.invalidateQueries({ queryKey: participantKeys.all })
      toast.success('Контакт переименован')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось переименовать'))
    },
  })
}

export function useMergeParticipants(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ targetId, sourceId }: { targetId: string; sourceId: string }) => {
      const { error } = await supabase.rpc('merge_participants', {
        p_target_id: targetId,
        p_source_id: sourceId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: participantKeys.all })
      invalidateAfterThreadMove(qc, workspaceId)
      toast.success('Контакты объединены')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось объединить'))
    },
  })
}
