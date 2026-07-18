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
  project_name_prefix: string | null
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

/**
 * Все треды, где контакт участвует (не только прямой чат): собеседник +
 * личные TG-диалоги по числовому tg-id + треды проектов клиента. Логика —
 * в RPC `get_contact_participation_threads` (SECURITY INVOKER, RLS режет под
 * смотрящего). Раньше здесь было два отдельных хука (собеседник + прямой чат
 * по tg-id) — RPC объединяет оба сигнала и добавляет проекты клиента.
 */
export function useContactThreads(participantId: string | null | undefined) {
  return useQuery<ContactThread[]>({
    queryKey: contactThreadKeys.byParticipant(participantId ?? ''),
    queryFn: async () => {
      if (!participantId) return []
      const { data, error } = await supabase.rpc('get_contact_participation_threads', {
        p_participant_id: participantId,
      })
      if (error) throw error
      return (data ?? []) as ContactThread[]
    },
    enabled: !!participantId,
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
