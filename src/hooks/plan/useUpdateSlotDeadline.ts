"use client"

/**
 * Обновление срока (deadline) у слота документа из модуля «План».
 *
 * Поле folder_slots.deadline уже есть в схеме (просто не выводилось в UI).
 * Пишем напрямую и инвалидируем кэш слотов — вкладку «Документы» не трогаем,
 * она подхватит изменение через тот же folderSlotKeys.byProject.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { folderSlotKeys } from '@/hooks/queryKeys'

export function useUpdateSlotDeadline(projectId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ slotId, deadline }: { slotId: string; deadline: string | null }) => {
      const { error } = await supabase
        .from('folder_slots')
        .update({ deadline })
        .eq('id', slotId)
      if (error) throw error
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })
}
