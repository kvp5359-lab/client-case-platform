"use client"

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  contactThreadKeys,
  invalidateAfterThreadMove,
  participantKeys,
  STALE_TIME,
} from '@/hooks/queryKeys'

export interface ContactParticipant {
  id: string
  workspace_id: string
  user_id: string | null
  name: string
  last_name: string | null
  email: string
  phone: string | null
  telegram_user_id: number | null
  avatar_url: string | null
  notes: string | null
  can_login: boolean
  workspace_roles: string[]
}

export interface ContactThread {
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
        .select('id, workspace_id, user_id, name, last_name, email, phone, telegram_user_id, avatar_url, notes, can_login, workspace_roles')
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
      toast.error(`Не удалось объединить: ${err.message}`)
    },
  })
}
