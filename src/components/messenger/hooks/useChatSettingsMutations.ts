/**
 * Mutations for ChatSettingsDialog (edit mode).
 * Extracted to reduce the main component size.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { messengerKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'
import type { AccessType } from '../chatSettingsTypes'

interface UseChatSettingsMutationsParams {
  chatId: string | undefined
  chatProjectId: string | null | undefined
  selectedProjectId: string | null
  resolvedWorkspaceId: string | undefined
}

export function useChatSettingsMutations({
  chatId,
  chatProjectId,
  selectedProjectId,
  resolvedWorkspaceId,
}: UseChatSettingsMutationsParams) {
  const queryClient = useQueryClient()

  const updateProjectMutation = useMutation({
    mutationFn: async (newProjectId: string | null) => {
      if (!chatId) return
      const { error } = await supabase
        .from('project_threads')
        .update({ project_id: newProjectId })
        .eq('id', chatId)
      if (error) throw error
    },
    onSuccess: () => {
      if (chatProjectId) {
        queryClient.invalidateQueries({
          queryKey: messengerKeys.projectThreads(chatProjectId),
        })
      }
      if (selectedProjectId) {
        queryClient.invalidateQueries({
          queryKey: messengerKeys.projectThreads(selectedProjectId),
        })
      }
      queryClient.invalidateQueries({ queryKey: ['workspace-tasks', resolvedWorkspaceId] })
    },
    onError: () => toast.error('Не удалось сменить проект'),
  })

  const updateStatusMutation = useMutation({
    mutationFn: async (statusId: string | null) => {
      if (!chatId) return
      const { error } = await supabase
        .from('project_threads')
        .update({ status_id: statusId })
        .eq('id', chatId)
      if (error) throw error
    },
    onSuccess: () => {
      if (chatProjectId)
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(chatProjectId) })
    },
    onError: () => toast.error('Не удалось обновить статус'),
  })

  const updateDeadlineMutation = useMutation({
    mutationFn: async (deadline: string | null) => {
      if (!chatId) return
      const { error } = await supabase.from('project_threads').update({ deadline }).eq('id', chatId)
      if (error) throw error
    },
    onSuccess: () => {
      if (chatProjectId)
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(chatProjectId) })
    },
    onError: () => toast.error('Не удалось обновить срок'),
  })

  const updateAccessMutation = useMutation({
    mutationFn: async ({
      accessType: newAccess,
      roles,
    }: {
      accessType: AccessType
      roles?: string[]
    }) => {
      if (!chatId) return
      const { error } = await supabase
        .from('project_threads')
        .update({
          access_type: newAccess,
          access_roles: newAccess === 'roles' ? (roles ?? []) : [],
        })
        .eq('id', chatId)
      if (error) throw error
    },
    onSuccess: () => {
      if (chatProjectId)
        queryClient.invalidateQueries({ queryKey: messengerKeys.projectThreads(chatProjectId) })
    },
  })

  const toggleMemberMutation = useMutation({
    mutationFn: async ({ participantId, add }: { participantId: string; add: boolean }) => {
      if (!chatId) return
      if (add) {
        const { error } = await supabase
          .from('project_thread_members')
          .insert({ thread_id: chatId, participant_id: participantId })
        if (error && error.code !== '23505') throw error
      } else {
        const { error } = await supabase
          .from('project_thread_members')
          .delete()
          .eq('thread_id', chatId)
          .eq('participant_id', participantId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      if (chatId) queryClient.invalidateQueries({ queryKey: ['thread-members', chatId] })
    },
  })

  return {
    updateProjectMutation,
    updateStatusMutation,
    updateDeadlineMutation,
    updateAccessMutation,
    toggleMemberMutation,
    queryClient,
  }
}
