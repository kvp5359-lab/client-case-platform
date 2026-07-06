"use client"

/**
 * useMoveThreadToProject — перенос треда в проект или обратно в «Без проекта».
 *
 * Единственная фронт-точка вызова RPC `move_thread_to_project`. RPC двигает
 * project_id И у треда, И у всех его сообщений атомарно (SECURITY DEFINER) —
 * в отличие от старого прямого UPDATE в настройках чата, который двигал только
 * тред и оставлял project_messages.project_id рассинхронизированным.
 *
 * `projectId = null` → перенос в «Без проекта» (личные диалоги).
 *
 * Используется кнопкой выбора проекта в шапке боковой панели (мгновенное
 * применение) и мутацией смены проекта в настройках чата.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { invalidateAfterThreadMove, chatSettingsKeys, threadScopeKeys } from '@/hooks/queryKeys'

export function useMoveThreadToProject(workspaceId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      threadId,
      projectId,
    }: {
      threadId: string
      projectId: string | null
    }) => {
      const { error } = await supabase.rpc('move_thread_to_project', {
        p_thread_id: threadId,
        p_target_project_id: projectId,
      })
      if (error) throw error
    },
    onSuccess: (_data, { threadId }) => {
      invalidateAfterThreadMove(queryClient, workspaceId)
      // Список проектов в селекторе (picker) — чтобы свежесозданный через «+»
      // проект сразу появился в списке и его имя показалось в чипе.
      queryClient.invalidateQueries({ queryKey: chatSettingsKeys.workspaceProjects(workspaceId) })
      // Scope-кэш треда (project_id/contact_participant_id) держит верхнюю строку
      // боковой панели (карточка контакта vs проекта). Без сброса строка не
      // перестраивается до F5 — рендерер продолжает видеть старый project_id=null.
      queryClient.invalidateQueries({ queryKey: threadScopeKeys.byThread(threadId) })
    },
    onError: () => toast.error('Не удалось сменить проект'),
  })
}
