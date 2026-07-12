"use client"

/**
 * Каналы связи участника (telegram, email, phone и т.д.).
 * Один participant — много каналов любого типа.
 *
 * Поиск participant по каналу (lookup) нужен для маршрутизации входящих
 * сообщений в этапе 9 CRM-фрейма; пока — для UI поиска в селекторе «Контакт».
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { participantChannelKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { Database } from '@/types/database'

export type ParticipantChannel = Database['public']['Tables']['participant_channels']['Row']
export type ChannelType = 'telegram' | 'email' | 'phone' | string

type UpsertChannelInput = {
  participant_id: string
  workspace_id: string
  channel_type: ChannelType
  external_id: string
  label?: string | null
  is_primary?: boolean
}

/** Список каналов одного участника. */
export function useParticipantChannels(participantId: string | undefined) {
  return useQuery({
    queryKey: participantChannelKeys.byParticipant(participantId),
    queryFn: async (): Promise<ParticipantChannel[]> => {
      if (!participantId) return []
      const { data, error } = await supabase
        .from('participant_channels')
        .select('*')
        .eq('participant_id', participantId)
        .order('channel_type', { ascending: true })
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!participantId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/** Создать канал. Если такой external_id уже привязан в воркспейсе — упадёт по UNIQUE. */
export function useCreateParticipantChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertChannelInput): Promise<ParticipantChannel> => {
      const { data, error } = await supabase
        .from('participant_channels')
        .insert({
          participant_id: input.participant_id,
          workspace_id: input.workspace_id,
          channel_type: input.channel_type,
          external_id: normalizeExternalId(input.channel_type, input.external_id),
          label: input.label ?? null,
          is_primary: input.is_primary ?? false,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: participantChannelKeys.byParticipant(row.participant_id),
      })
      queryClient.invalidateQueries({
        queryKey: participantChannelKeys.byWorkspace(row.workspace_id),
      })
    },
  })
}

/** Удалить канал. */
export function useDeleteParticipantChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (channelId: string): Promise<{ id: string; participant_id: string }> => {
      // Сначала достаём, чтобы потом инвалидировать ключ участника
      const { data: existing, error: readErr } = await supabase
        .from('participant_channels')
        .select('id, participant_id')
        .eq('id', channelId)
        .single()
      if (readErr) throw readErr
      const { error } = await supabase.from('participant_channels').delete().eq('id', channelId)
      if (error) throw error
      return existing
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: participantChannelKeys.byParticipant(row.participant_id),
      })
    },
  })
}

/**
 * Сделать канал primary в своём типе. Снимает is_primary у других каналов
 * того же типа у того же participant'а, ставит у выбранного.
 */
export function useSetPrimaryChannel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; participant_id: string; channel_type: string }) => {
      // Сбрасываем primary у других того же типа
      const { error: clearErr } = await supabase
        .from('participant_channels')
        .update({ is_primary: false })
        .eq('participant_id', input.participant_id)
        .eq('channel_type', input.channel_type)
        .neq('id', input.id)
      if (clearErr) throw clearErr
      // Ставим у выбранного
      const { error } = await supabase
        .from('participant_channels')
        .update({ is_primary: true })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: participantChannelKeys.byParticipant(vars.participant_id),
      })
    },
  })
}

/**
 * Нормализация external_id под тип канала. Email → lowercase + trim.
 * Phone и telegram оставляем как есть (пока).
 */
export function normalizeExternalId(channelType: string, value: string): string {
  if (channelType === 'email') return value.trim().toLowerCase()
  return value.trim()
}
