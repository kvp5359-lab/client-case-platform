/**
 * useParticipantsMutations — query и мутации для управления участниками
 *
 * Вынесено из ParticipantsTab.tsx
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Participant } from '@/types/entities'
import { STALE_TIME } from '@/hooks/queryKeys'

const participantKeys = {
  byWorkspace: (workspaceId: string) => ['participants', workspaceId] as const,
}

export { participantKeys }

export function useParticipantsMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  const invalidateParticipants = () => {
    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: participantKeys.byWorkspace(workspaceId) })
    }
  }

  // --- Query ---

  const { data: participants = [], isLoading } = useQuery({
    queryKey: participantKeys.byWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as Participant[]
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
  })

  // --- Mutations ---

  const toggleAccessMutation = useMutation({
    mutationFn: async ({
      participantId,
      canLogin,
    }: {
      participantId: string
      canLogin: boolean
    }) => {
      const { error } = await supabase
        .from('participants')
        .update({ can_login: canLogin })
        .eq('id', participantId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateParticipants()
    },
    onError: () => {
      toast.error('Не удалось изменить доступ участника')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const { error } = await supabase
        .from('participants')
        .update({ is_deleted: true })
        .eq('id', participantId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateParticipants()
      toast.success('Участник удалён')
    },
    onError: () => {
      toast.error('Не удалось удалить участника')
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({
      participantId,
      data,
    }: {
      participantId: string
      data: Partial<Participant>
    }) => {
      const { error } = await supabase.from('participants').update(data).eq('id', participantId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateParticipants()
      toast.success('Участник обновлён')
    },
    onError: () => {
      toast.error('Не удалось сохранить участника')
    },
  })

  const addMutation = useMutation({
    mutationFn: async (data: Partial<Participant>) => {
      const { error } = await supabase
        .from('participants')
        .insert({
          workspace_id: workspaceId!,
          name: data.name || '',
          last_name: data.last_name || null,
          email: data.email || '',
          phone: data.phone || null,
          telegram_user_id: data.telegram_user_id || null,
          avatar_url: data.avatar_url || null,
          workspace_roles: data.workspace_roles || [],
          can_login: data.can_login ?? true,
        })
        .select()
        .single()
      if (error) throw error
    },
    onSuccess: () => {
      invalidateParticipants()
      toast.success('Участник добавлен')
    },
    onError: () => {
      toast.error('Не удалось добавить участника')
    },
  })

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const { error } = await supabase.rpc('merge_telegram_contact', {
        p_source_id: sourceId,
        p_target_id: targetId,
        p_workspace_id: workspaceId!,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateParticipants()
      toast.success('Telegram-контакт привязан к участнику')
    },
    onError: () => {
      toast.error('Не удалось привязать Telegram-контакт')
    },
  })

  // --- Computed: ID участника, для которого идёт операция ---

  const actionInProgressId =
    toggleAccessMutation.isPending && toggleAccessMutation.variables
      ? toggleAccessMutation.variables.participantId
      : deleteMutation.isPending && deleteMutation.variables
        ? deleteMutation.variables
        : editMutation.isPending && editMutation.variables
          ? editMutation.variables.participantId
          : null

  return {
    participants,
    isLoading,
    toggleAccessMutation,
    deleteMutation,
    editMutation,
    addMutation,
    mergeMutation,
    actionInProgressId,
  }
}
