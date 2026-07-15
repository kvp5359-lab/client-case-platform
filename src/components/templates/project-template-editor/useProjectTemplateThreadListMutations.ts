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
      commonAssigneeIds,
    }: {
      data: ThreadTemplateFormData
      templateId: string | null
      /** Текущие ОБЩИЕ исполнители шаблона — передаём в RPC при пер-проектном
       *  сохранении, чтобы RPC (delete+reinsert) их не стёр. */
      commonAssigneeIds?: string[]
    }) => {
      const { assignee_ids, projectOverride, ...templateData } = data
      // Пер-проектные поля живут в junction, тело — в глобальном thread_templates.
      const perProject = {
        default_status_id: templateData.default_status_id ?? null,
        on_complete_set_project_status_id:
          templateData.on_complete_set_project_status_id ?? null,
      }

      if (templateId && projectOverride) {
        // ── Пер-проектное переопределение (редактирование этапа внутри типа
        // проекта). Общее тело (имя/иконка/название/тип/описание) — в общий
        // шаблон; исполнителей общего шаблона НЕ трогаем (передаём как есть).
        // Дедлайн/сообщение/доступ/исполнители — в junction + override-таблицу.
        const commonBody = {
          name: data.name,
          description: data.description,
          default_description: data.default_description,
          thread_type: data.thread_type,
          is_email: data.is_email,
          assign_to_creator: data.assign_to_creator,
          thread_name_template: data.thread_name_template,
          accent_color: data.accent_color,
          icon: data.icon,
          default_project_id: data.default_project_id,
          default_contact_email: data.default_contact_email,
          email_subject_template: data.email_subject_template,
        }
        const { error } = await supabase.rpc('update_thread_template_with_assignees', {
          p_template_id: templateId,
          p_updates: commonBody,
          p_assignee_ids: commonAssigneeIds ?? [],
        })
        if (error) throw error
        const { error: jErr } = await supabase
          .from('project_template_thread_templates')
          .update({
            ...perProject,
            deadline_days: projectOverride.deadline_days,
            initial_message_html: projectOverride.initial_message_html,
            access_type: projectOverride.access_type,
            access_roles: projectOverride.access_roles,
            // Источник правды об исполнителях — assignees_mode.
            assignees_mode: projectOverride.assignees_overridden ? 'override' : 'inherit',
          })
          .eq('template_id', projectTemplateId)
          .eq('thread_template_id', templateId)
        if (jErr) throw jErr
        // Override-исполнители: переписываем набор целиком.
        const { error: delErr } = await supabase
          .from('project_template_thread_assignees')
          .delete()
          .eq('template_id', projectTemplateId)
          .eq('thread_template_id', templateId)
        if (delErr) throw delErr
        if (projectOverride.assignees_overridden && projectOverride.override_assignee_ids.length > 0) {
          const { error: insErr } = await supabase
            .from('project_template_thread_assignees')
            .insert(
              projectOverride.override_assignee_ids.map((pid) => ({
                template_id: projectTemplateId,
                thread_template_id: templateId,
                participant_id: pid,
              })),
            )
          if (insErr) throw insErr
        }
      } else if (templateId) {
        // Тело + исполнители — в глобальный шаблон (общий для всех типов).
        const { error } = await supabase.rpc('update_thread_template_with_assignees', {
          p_template_id: templateId,
          p_updates: templateData,
          p_assignee_ids: assignee_ids,
        })
        if (error) throw error
        // Пер-проектные настройки — в junction этого типа проекта.
        const { error: jErr } = await supabase
          .from('project_template_thread_templates')
          .update(perProject)
          .eq('template_id', projectTemplateId)
          .eq('thread_template_id', templateId)
        if (jErr) throw jErr
      } else {
        // Новый глобальный шаблон (тело), потом привязка к типу через junction.
        const { data: created, error } = await supabase
          .from('thread_templates')
          .insert({
            ...templateData,
            workspace_id: workspaceId,
            owner_project_template_id: null,
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
        const { error: jErr } = await supabase
          .from('project_template_thread_templates')
          .insert({
            template_id: projectTemplateId,
            thread_template_id: created.id,
            sort_order: maxSort + 1,
            ...perProject,
          })
        if (jErr) throw jErr
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
      // Отвязываем этап от этого типа проекта (junction). Сам глобальный шаблон
      // остаётся в библиотеке — он может использоваться другими типами.
      const { error } = await supabase
        .from('project_template_thread_templates')
        .delete()
        .eq('template_id', projectTemplateId)
        .eq('thread_template_id', id)
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
      // Создаём глобальную копию тела и привязываем её к этому типу проекта,
      // унаследовав пер-проектные настройки исходного этапа.
      const { data: newId, error } = await supabase.rpc('copy_thread_template', {
        p_template_id: item.id,
      })
      if (error) throw error
      const { error: jErr } = await supabase
        .from('project_template_thread_templates')
        .insert({
          template_id: projectTemplateId,
          thread_template_id: newId as string,
          sort_order: maxSort + 1,
          default_status_id: item.default_status_id ?? null,
          on_complete_set_project_status_id: item.on_complete_set_project_status_id ?? null,
        })
      if (jErr) throw jErr
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

  // Привязка существующего глобального шаблона из библиотеки к этому типу
  // проекта (junction). Пер-проектные настройки наследуем со значений шаблона.
  const attachMutation = useMutation({
    mutationFn: async (tpl: ThreadTemplate) => {
      const { error } = await supabase
        .from('project_template_thread_templates')
        .insert({
          template_id: projectTemplateId,
          thread_template_id: tpl.id,
          sort_order: maxSort + 1,
          default_status_id: tpl.default_status_id ?? null,
          on_complete_set_project_status_id: tpl.on_complete_set_project_status_id ?? null,
        })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон добавлен')
    },
    onError: (error) => {
      logger.error('Ошибка привязки шаблона треда:', error)
      toast.error('Не удалось добавить шаблон')
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
          supabase
            .from('project_template_thread_templates')
            .update({ sort_order: o.sort_order })
            .eq('template_id', projectTemplateId)
            .eq('thread_template_id', o.id),
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

  return { invalidate, saveMutation, deleteMutation, copyMutation, reorderMutation, attachMutation }
}
