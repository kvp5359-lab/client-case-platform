"use client"

/**
 * useTaskAssignees — исполнители задачи (task_assignees).
 * Отдельно от project_thread_members (те — для доступа к чату).
 *
 * - useTaskAssigneesMap(threadIds) — batch-загрузка для списка задач
 * - useTaskAssignees(threadId) — список исполнителей одной задачи
 * - useToggleAssignee — добавить/убрать исполнителя
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildParticipantMap } from '@/utils/buildParticipantMap'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

export const assigneeKeys = {
  map: (ids: string) => ['task-assignees-map', ids] as const,
  single: (threadId: string) => ['task-assignees', threadId] as const,
}

/** Batch-загрузка исполнителей для списка задач */
export function useTaskAssigneesMap(threadIds: string[]) {
  const key = [...threadIds].sort().join(',')
  return useQuery({
    queryKey: assigneeKeys.map(key),
    queryFn: async () => {
      if (threadIds.length === 0) return {} as Record<string, AvatarParticipant[]>

      const { data, error } = await supabase
        .from('task_assignees')
        .select('thread_id, participants!inner(id, name, last_name, avatar_url)')
        .in('thread_id', threadIds)

      if (error) throw error

      return buildParticipantMap(data ?? [])
    },
    enabled: threadIds.length > 0,
    staleTime: 30_000,
  })
}

/** Исполнители одной задачи (participant_id[]) */
export function useTaskAssigneeIds(threadId: string | undefined) {
  return useQuery({
    queryKey: assigneeKeys.single(threadId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_assignees')
        .select('participant_id')
        .eq('thread_id', threadId!)

      if (error) throw error
      return (data ?? []).map((r) => r.participant_id)
    },
    enabled: !!threadId,
    staleTime: 30_000,
  })
}

/** Добавить/убрать исполнителя (toggle) */
export function useToggleAssignee(threadId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      participantId,
      assigned,
    }: {
      participantId: string
      assigned: boolean
    }) => {
      if (!threadId) throw new Error('No threadId')

      if (assigned) {
        // Удалить
        const { error } = await supabase
          .from('task_assignees')
          .delete()
          .eq('thread_id', threadId)
          .eq('participant_id', participantId)
        if (error) throw error
      } else {
        // Добавить
        const { error } = await supabase
          .from('task_assignees')
          .insert({ thread_id: threadId, participant_id: participantId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: assigneeKeys.single(threadId) })
        // Инвалидируем batch-карту тоже
        queryClient.invalidateQueries({ queryKey: ['task-assignees-map'] })
      }
    },
  })
}
