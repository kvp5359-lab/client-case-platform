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
import { hashIdList } from '@/lib/hashIdList'
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
 *
 *  ⚠️ Только RPC с массивом id (POST), НЕ `.in('thread_id', chunk)` GET-чанками:
 *  чанки по 40 на доске с календарным списком (~2000 тредов) давали ~50
 *  параллельных запросов на маунт (аудит 2026-07-23, суммарно ~19с сетевого
 *  времени). RPC — один запрос без лимита URL, RLS та же (SECURITY INVOKER). */
export function useTaskAssigneesMap(threadIds: string[]) {
  // Хеш вместо join: на доске с календарём ключ был строкой ~74 КБ (аудит №12).
  const key = hashIdList(threadIds)
  return useQuery({
    queryKey: assigneeKeys.map(key),
    queryFn: async () => {
      if (threadIds.length === 0) return {} as Record<string, AvatarParticipant[]>

      const { data, error } = await supabase.rpc('get_task_assignees_for_threads', {
        p_thread_ids: threadIds,
      })
      if (error) throw error

      const merged = (data ?? []).map((r) => ({
        thread_id: r.thread_id,
        participants: {
          id: r.participant_id,
          name: r.name,
          last_name: r.last_name,
          avatar_url: r.avatar_url,
        },
      }))
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
