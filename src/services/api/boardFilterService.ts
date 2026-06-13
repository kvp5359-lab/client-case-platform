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
import type { WorkspaceTask, BoardProject } from '@/types/board'

/** Проект доски + поля ближайшей активной задачи (считаются на сервере). */
export type BoardFilteredProject = BoardProject & {
  next_task_id: string | null
  next_task_name: string | null
  next_task_deadline: string | null
}

// PostgREST отдаёт максимум 1000 строк за запрос. Если union-фильтр доски
// вырождается в пустой (есть список без фильтра — например календарный) — сервер
// возвращает весь воркспейс, и без пагинации строки за границей 1000 терялись
// (баг: задачи с дальней позицией пропадали из колонок). Грузим постранично.
const PAGE = 1000

export async function getBoardFilteredThreads(
  workspaceId: string,
  userId: string,
  filter: FilterGroup,
): Promise<WorkspaceTask[]> {
  const all: WorkspaceTask[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('get_board_filtered_threads', {
        p_workspace_id: workspaceId,
        p_user_id: userId,
        p_filter: filter as unknown as Json,
      })
      .range(from, from + PAGE - 1)
    if (error) throw new ApiError(`Ошибка загрузки тредов доски: ${error.message}`)
    const batch = (data ?? []) as unknown as WorkspaceTask[]
    all.push(...batch)
    if (batch.length < PAGE) break
  }
  return all
}

export async function getBoardFilteredProjects(
  workspaceId: string,
  userId: string,
  filter: FilterGroup,
): Promise<BoardFilteredProject[]> {
  const all: BoardFilteredProject[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('get_board_filtered_projects', {
        p_workspace_id: workspaceId,
        p_user_id: userId,
        p_filter: filter as unknown as Json,
      })
      .range(from, from + PAGE - 1)
    if (error) throw new ApiError(`Ошибка загрузки проектов доски: ${error.message}`)
    const batch = (data ?? []) as unknown as BoardFilteredProject[]
    all.push(...batch)
    if (batch.length < PAGE) break
  }
  return all
}
