"use client"

/**
 * Мутация смены статуса проекта в контексте доски (drag-n-drop между группами).
 * Принимает projectId на момент вызова, в отличие от useProjectMutations,
 * где projectId фиксируется хуком-константой.
 *
 * Optimistic: карточка проекта группируется по status_id на клиенте из кэша
 * `boardKeys.projectsByWorkspace`. Без optimistic после drop карточка «отскакивает»
 * в старую колонку до завершения refetch. Поэтому сразу проставляем новый
 * status_id в этот кэш — карточка остаётся в целевой колонке. При ошибке — откат.
 *
 * После успеха/ошибки инвалидирует кэши проектов, чтобы группировка
 * пересчиталась из БД.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { accessibleProjectKeys, projectKeys, boardKeys, boardFilteredKeys } from '@/hooks/queryKeys'
import type { BoardProject } from './useWorkspaceProjects'

type UpdateProjectStatusInput = {
  projectId: string
  statusId: string | null
}

export function useUpdateProjectStatusOnBoard(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const boardProjectsKey = boardKeys.projectsByWorkspace(workspaceId ?? '')
  // Доска (вариант A) читает проекты из серверно-фильтрованных кэшей по префиксу
  // (ключ включает union-фильтр), а не из boardProjectsKey. Патчим оба.
  const filteredPrefix = boardFilteredKeys.projectsAll(workspaceId ?? '')

  return useMutation({
    mutationFn: async ({ projectId, statusId }: UpdateProjectStatusInput) => {
      const { error } = await supabase
        .from('projects')
        .update({ status_id: statusId })
        .eq('id', projectId)
      if (error) throw error
    },
    onMutate: async ({ projectId, statusId }) => {
      await queryClient.cancelQueries({ queryKey: boardProjectsKey })
      await queryClient.cancelQueries({ queryKey: filteredPrefix })
      const previousProjects = queryClient.getQueryData<BoardProject[]>(boardProjectsKey)
      // Снимок всех серверно-фильтрованных кэшей проектов (по всем фильтрам).
      const previousFiltered = queryClient.getQueriesData<BoardProject[]>({ queryKey: filteredPrefix })
      const patch = (old: BoardProject[] | undefined) =>
        old?.map((p) => (p.id === projectId ? { ...p, status_id: statusId } : p))
      queryClient.setQueryData<BoardProject[]>(boardProjectsKey, patch)
      queryClient.setQueriesData<BoardProject[]>({ queryKey: filteredPrefix }, patch)
      return { previousProjects, previousFiltered }
    },
    onError: (err, _vars, context) => {
      if (context?.previousProjects !== undefined) {
        queryClient.setQueryData(boardProjectsKey, context.previousProjects)
      }
      for (const [key, data] of context?.previousFiltered ?? []) {
        queryClient.setQueryData(key, data)
      }
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить статус проекта')
    },
    onSettled: (_data, _err, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: boardProjectsKey })
      queryClient.invalidateQueries({ queryKey: filteredPrefix })
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}
