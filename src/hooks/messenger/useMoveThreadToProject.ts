import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

/**
 * Перенос треда в другой проект (например, из системного инбокса Wazzup
 * в обычный рабочий проект). RPC `move_thread_to_project` обновляет
 * project_threads.project_id + project_messages.project_id.
 */
export function useMoveThreadToProject(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ threadId, targetProjectId }: { threadId: string; targetProjectId: string }) => {
      const { error } = await supabase.rpc('move_thread_to_project' as never, {
        p_thread_id: threadId,
        p_target_project_id: targetProjectId,
      } as never)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sidebar'] })
      qc.invalidateQueries({ queryKey: ['threads'] })
      qc.invalidateQueries({ queryKey: ['messenger'] })
      if (workspaceId) qc.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      toast.success('Тред перенесён')
    },
    onError: (err: Error) => {
      toast.error(`Не удалось перенести: ${err.message}`)
    },
  })
}
