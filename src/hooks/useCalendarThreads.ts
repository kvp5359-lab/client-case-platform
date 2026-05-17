/**
 * Хуки для time-grid календаря.
 *
 * Календарь показывает треды-задачи с заполненными start_at/end_at.
 * Задачи без интервала времени в календарь не попадают — они живут в
 * обычных списках/досках с deadline-точкой.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  calendarKeys,
  messengerKeys,
  myTaskCountsKeys,
  projectThreadKeys,
  taskKeys,
  workspaceTaskKeys,
} from '@/hooks/queryKeys'
import { logAuditAction } from '@/services/auditService'

export interface CalendarThread {
  id: string
  workspace_id: string
  project_id: string | null
  name: string
  type: string
  status_id: string | null
  start_at: string
  end_at: string
  accent_color: string
  icon: string
  deadline: string | null
}

/**
 * Треды-задачи с интервалом времени, пересекающимся с [from, to].
 * Условие пересечения: start_at < to AND end_at > from.
 */
export function useCalendarThreads(
  workspaceId: string | undefined,
  from: Date | undefined,
  to: Date | undefined,
) {
  const fromIso = from?.toISOString() ?? ''
  const toIso = to?.toISOString() ?? ''

  return useQuery({
    queryKey: calendarKeys.byWorkspaceRange(workspaceId ?? '', fromIso, toIso),
    enabled: Boolean(workspaceId && from && to),
    queryFn: async (): Promise<CalendarThread[]> => {
      const { data, error } = await supabase
        .from('project_threads')
        .select(
          'id, workspace_id, project_id, name, type, status_id, start_at, end_at, accent_color, icon, deadline',
        )
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .not('start_at', 'is', null)
        .not('end_at', 'is', null)
        .lt('start_at', toIso)
        .gt('end_at', fromIso)
        .order('start_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as CalendarThread[]
    },
  })
}

/**
 * Обновление времени треда (drag/resize в календаре).
 *
 * Передавайте null чтобы убрать тред из календаря (вернуть в «без даты»).
 * Если меняете время — передавайте оба поля (start_at + end_at), даже если
 * меняется только одно: это упрощает audit-лог и optimistic updates.
 */
export function useUpdateThreadTime() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      threadId: string
      projectId: string | null
      workspaceId: string
      start_at: string | null
      end_at: string | null
    }) => {
      const { data: old } = await supabase
        .from('project_threads')
        .select('start_at, end_at')
        .eq('id', params.threadId)
        .single()

      const { error } = await supabase
        .from('project_threads')
        .update({ start_at: params.start_at, end_at: params.end_at })
        .eq('id', params.threadId)
      if (error) throw error

      logAuditAction(
        'change_settings',
        'thread',
        params.threadId,
        {
          start_at: params.start_at,
          end_at: params.end_at,
          old_start_at: old?.start_at,
          old_end_at: old?.end_at,
        },
        params.projectId ?? undefined,
      )

      return params
    },
    onMutate: async (params) => {
      // Optimistic update: меняем кэш до ответа сервера, иначе на resize
      // граница визуально «возвращается» на старое место до завершения
      // network round-trip. Покрываем два формата кэша:
      //  - CalendarThread[] (useCalendarThreads) — для уже видимых задач
      //  - Record<id, {start_at,end_at}> (board-list-times внутри
      //    BoardListCalendarView) — апсёртим всегда, в т.ч. для новых
      //    дропнутых задач (entry ещё не было).
      await queryClient.cancelQueries({ queryKey: calendarKeys.all })
      queryClient.setQueriesData(
        { queryKey: calendarKeys.all },
        (old: unknown) => {
          if (!old) return old
          if (Array.isArray(old)) {
            // Если задача уже в массиве — обновляем; если нет — пропускаем
            // (без полной CalendarThread не сможем добавить корректно).
            return old.map((t: { id: string }) =>
              t.id === params.threadId
                ? { ...t, start_at: params.start_at, end_at: params.end_at }
                : t,
            )
          }
          if (typeof old === 'object') {
            return {
              ...(old as Record<string, unknown>),
              [params.threadId]: { start_at: params.start_at, end_at: params.end_at },
            }
          }
          return old
        },
      )
    },
    onSuccess: (params) => {
      // Календарь и обычные представления тредов могут показывать одну и ту
      // же задачу — инвалидируем оба слоя.
      queryClient.invalidateQueries({ queryKey: calendarKeys.all })
      queryClient.invalidateQueries({ queryKey: projectThreadKeys.byId(params.threadId) })
      if (params.projectId) {
        queryClient.invalidateQueries({
          queryKey: messengerKeys.projectThreads(params.projectId),
        })
      }
      // Дедлайн/время могут влиять на «мои задачи» и счётчики.
      queryClient.invalidateQueries({ queryKey: taskKeys.urgentCount(params.workspaceId) })
      queryClient.invalidateQueries({ queryKey: myTaskCountsKeys.byWorkspace(params.workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceTaskKeys.byWorkspace(params.workspaceId) })
    },
  })
}
