"use client"

/**
 * Мутации списка шаблонов задач/чатов проекта (save/delete/copy/reorder),
 * вынесены из ProjectTemplateThreadList. Toast + инвалидация — в хуке;
 * закрытие диалога — в компоненте через per-call `mutate(.., { onSuccess })`.
 */

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { threadTemplateKeys, planKeys } from '@/hooks/queryKeys'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'

export function useProjectTemplateThreadListMutations(params: {
  workspaceId: string
  projectTemplateId: string
  /** Текущий максимальный sort_order — для вставки нового шаблона в конец. */
  maxSort: number
  /** Запись порядка блоков плана (из useTemplatePlan) — для общего reorder. */
  setBlockOrders: (orders: { id: string; sort_order: number }[]) => Promise<void> | void
}) {
  const { workspaceId, projectTemplateId, maxSort, setBlockOrders } = params
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: threadTemplateKeys.byProjectTemplate(projectTemplateId),
    })
    queryClient.invalidateQueries({ queryKey: threadTemplateKeys.all })
    queryClient.invalidateQueries({ queryKey: planKeys.templateByTemplate(projectTemplateId) })
  }, [queryClient, projectTemplateId])

  const saveMutation = useMutation({
    mutationFn: async ({
      data,
      templateId,
    }: {
      data: ThreadTemplateFormData
      templateId: string | null
    }) => {
      const { assignee_ids, ...templateData } = data

      if (templateId) {
        const { error } = await supabase.rpc('update_thread_template_with_assignees', {
          p_template_id: templateId,
          p_updates: templateData,
          p_assignee_ids: assignee_ids,
        })
        if (error) throw error
      } else {
        const nextSort = maxSort + 1
        const { data: created, error } = await supabase
          .from('thread_templates')
          .insert({
            ...templateData,
            workspace_id: workspaceId,
            owner_project_template_id: projectTemplateId,
            sort_order: nextSort,
          })
          .select('id')
          .single()
        if (error) throw error
        if (assignee_ids.length > 0) {
          const { error: aErr } = await supabase
            .from('thread_template_assignees')
            .insert(assignee_ids.map((pid) => ({ template_id: created.id, participant_id: pid })))
          if (aErr) throw aErr
        }
      }
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон сохранён')
    },
    onError: (error) => {
      logger.error('Ошибка сохранения шаблона треда:', error)
      toast.error('Не удалось сохранить шаблон')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('thread_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон удалён')
    },
    onError: (error) => {
      logger.error('Ошибка удаления шаблона треда:', error)
      toast.error('Не удалось удалить шаблон')
    },
  })

  const copyMutation = useMutation({
    mutationFn: async (item: ThreadTemplate) => {
      const { error } = await supabase.rpc('copy_thread_template', { p_template_id: item.id })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон скопирован')
    },
    onError: (error) => {
      logger.error('Ошибка копирования шаблона треда:', error)
      toast.error('Не удалось скопировать шаблон')
    },
  })

  // Единый reorder: задачи в thread_templates, блоки в project_template_plan_blocks.
  const reorderMutation = useMutation({
    mutationFn: async ({
      taskOrders,
      blockOrders,
    }: {
      taskOrders: { id: string; sort_order: number }[]
      blockOrders: { id: string; sort_order: number }[]
    }) => {
      const results = await Promise.all(
        taskOrders.map((o) =>
          supabase.from('thread_templates').update({ sort_order: o.sort_order }).eq('id', o.id),
        ),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
      if (blockOrders.length > 0) await setBlockOrders(blockOrders)
    },
    onError: (error) => {
      logger.error('Ошибка переупорядочивания списка задач:', error)
      toast.error('Не удалось сохранить порядок')
      invalidate()
    },
  })

  return { invalidate, saveMutation, deleteMutation, copyMutation, reorderMutation }
}
