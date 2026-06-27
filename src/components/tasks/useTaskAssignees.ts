"use client"

/**
 * useTaskAssignees — исполнители задачи (task_assignees).
 * Отдельно от project_thread_members (те — для доступа к чату).
 *
 * - useTaskAssigneesMap(threadIds) — batch-загрузка для списка задач
 * - useTaskAssignees(threadId) — список исполнителей одной задачи
 * - useToggleAssignee — добавить/убрать исполнителя
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildParticipantMap } from '@/utils/format/buildParticipantMap'
import { workspaceTaskKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'

export const assigneeKeys = {
  /** Broad-префиксы для инвалидации всех карт/списков исполнителей сразу. */
  mapAll: ['task-assignees-map'] as const,
  singleAll: ['task-assignees'] as const,
  map: (ids: string) => ['task-assignees-map', ids] as const,
  single: (threadId: string) => ['task-assignees', threadId] as const,
}

/** Batch-загрузка исполнителей для списка задач.
 *  keepPreviousData — при добавлении/удалении задачи показываем старую карту исполнителей,
 *  пока грузится новая. Иначе UI мигает (все аватарки пропадают на момент загрузки).
 *  Chunking — IN-фильтр PostgREST бьётся об URL-лимит при ~50+ UUID. Бьём на чанки. */
const ASSIGNEE_CHUNK_SIZE = 40

export function useTaskAssigneesMap(threadIds: string[]) {
  const key = [...threadIds].sort().join(',')
  return useQuery({
    queryKey: assigneeKeys.map(key),
    queryFn: async () => {
      if (threadIds.length === 0) return {} as Record<string, AvatarParticipant[]>

      const chunks: string[][] = []
      for (let i = 0; i < threadIds.length; i += ASSIGNEE_CHUNK_SIZE) {
        chunks.push(threadIds.slice(i, i + ASSIGNEE_CHUNK_SIZE))
      }

      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from('task_assignees')
            .select('thread_id, participants!inner(id, name, last_name, avatar_url)')
            .in('thread_id', chunk),
        ),
      )

      const merged: Array<{ thread_id: string; participants: unknown }> = []
      for (const { data, error } of results) {
        if (error) throw error
        if (data) merged.push(...(data as typeof merged))
      }

      return buildParticipantMap(merged)
    },
    enabled: threadIds.length > 0,
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
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
    staleTime: STALE_TIME.SHORT,
  })
}

/** Добавить/убрать исполнителя (toggle).
 *  Optimistic: список participant_id одной задачи (assigneeKeys.single) обновляется
 *  мгновенно — клик по аватарке сразу даёт отклик. При ошибке — откат к снимку.
 *  Batch-карту (assigneeKeys.map / workspaceTaskKeys.assigneesMap) не трогаем
 *  оптимистично (нужны имя/аватар) — только инвалидируем в onSettled. */
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
    onMutate: async ({ participantId, assigned }) => {
      if (!threadId) return { previousIds: undefined }
      const key = assigneeKeys.single(threadId)
      await queryClient.cancelQueries({ queryKey: key })
      const previousIds = queryClient.getQueryData<string[]>(key)
      queryClient.setQueryData<string[]>(key, (old) => {
        const ids = old ?? []
        return assigned
          ? ids.filter((id) => id !== participantId)
          : ids.includes(participantId)
            ? ids
            : [...ids, participantId]
      })
      return { previousIds }
    },
    onError: (_err, _vars, context) => {
      if (threadId && context?.previousIds !== undefined) {
        queryClient.setQueryData(assigneeKeys.single(threadId), context.previousIds)
      }
    },
    onSettled: () => {
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: assigneeKeys.single(threadId) })
        // Инвалидируем batch-карту тоже
        queryClient.invalidateQueries({ queryKey: workspaceTaskKeys.assigneesMap })
      }
    },
  })
}
