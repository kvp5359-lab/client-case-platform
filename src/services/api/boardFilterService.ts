/**
 * Серверная фильтрация досок (вариант A — union-prefilter).
 *
 * Доска отправляет ОДИН union-фильтр (OR фильтров всех своих списков) и получает
 * с сервера только подходящие треды/проекты. Сервер сужает грубо (с запасом),
 * клиентский движок (src/lib/filters) дорезает точно по каждому списку.
 *
 * RPC: get_board_filtered_threads / get_board_filtered_projects
 * (миграция 20260611_board_server_side_filter.sql).
 */

import { supabase } from '@/lib/supabase'
import { ApiError } from '@/services/errors/AppError'
import type { Json } from '@/types/database'
import type { FilterGroup } from '@/lib/filters/types'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'

/** Проект доски + поля ближайшей активной задачи (считаются на сервере). */
export type BoardFilteredProject = BoardProject & {
  next_task_id: string | null
  next_task_name: string | null
  next_task_deadline: string | null
}

export async function getBoardFilteredThreads(
  workspaceId: string,
  userId: string,
  filter: FilterGroup,
): Promise<WorkspaceTask[]> {
  const { data, error } = await supabase.rpc('get_board_filtered_threads', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_filter: filter as unknown as Json,
  })
  if (error) throw new ApiError(`Ошибка загрузки тредов доски: ${error.message}`)
  return (data ?? []) as unknown as WorkspaceTask[]
}

export async function getBoardFilteredProjects(
  workspaceId: string,
  userId: string,
  filter: FilterGroup,
): Promise<BoardFilteredProject[]> {
  const { data, error } = await supabase.rpc('get_board_filtered_projects', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_filter: filter as unknown as Json,
  })
  if (error) throw new ApiError(`Ошибка загрузки проектов доски: ${error.message}`)
  return (data ?? []) as unknown as BoardFilteredProject[]
}
