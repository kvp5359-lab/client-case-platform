"use client"

/**
 * Мутация смены статуса проекта в контексте доски (drag-n-drop между группами).
 * Принимает projectId на момент вызова, в отличие от useProjectMutations,
 * где projectId фиксируется хуком-константой.
 *
 * После успеха инвалидирует кэши проектов на досках, чтобы группировка
 * пересчиталась.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { accessibleProjectKeys, projectKeys } from '@/hooks/queryKeys'

type UpdateProjectStatusInput = {
  projectId: string
  statusId: string | null
}

export function useUpdateProjectStatusOnBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, statusId }: UpdateProjectStatusInput) => {
      const { error } = await supabase
        .from('projects')
        .update({ status_id: statusId })
        .eq('id', projectId)
      if (error) throw error
    },
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: accessibleProjectKeys.all })
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить статус проекта')
    },
  })
}
