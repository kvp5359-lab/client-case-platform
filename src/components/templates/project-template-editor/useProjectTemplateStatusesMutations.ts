"use client"

/**
 * Мутации секции статусов шаблона проекта (вынесены из
 * ProjectTemplateStatusesSection, чтобы тело компонента осталось тонким).
 *
 * Toast + инвалидация кэша — внутри хука. Закрытие диалогов/сброс UI-состояния
 * остаётся в компоненте через per-call `mutate(vars, { onSuccess })` —
 * чтобы хук не зависел от UI-сеттеров.
 */

import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { statusKeys, projectKeys } from '@/hooks/queryKeys'
import type { TemplateProjectStatus } from '@/hooks/useStatuses'
import type { Database } from '@/types/database'

type Status = Database['public']['Tables']['statuses']['Row']
type StatusInsert = Database['public']['Tables']['statuses']['Insert']

export function useProjectTemplateStatusesMutations(params: {
  workspaceId: string
  projectTemplateId: string
  /** Текущий список статусов шаблона — нужен для baseOrder при подключении. */
  statuses: TemplateProjectStatus[]
}) {
  const { workspaceId, projectTemplateId, statuses } = params
  const queryClient = useQueryClient()

  const tplKey = useMemo(
    () => statusKeys.projectByTemplate(workspaceId, projectTemplateId),
    [workspaceId, projectTemplateId],
  )

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: tplKey })
    queryClient.invalidateQueries({ queryKey: statusKeys.project(workspaceId) })
  }

  // Создание нового статуса: запись в statuses + связь в junction.
  // Редактирование: апдейт справочной части + per-template флагов в junction.
  const saveMutation = useMutation({
    mutationFn: async ({ editing, data }: { editing: Status | null; data: StatusInsert }) => {
      const sharedPayload = {
        name: data.name!.trim(),
        description: data.description?.trim() ?? '',
        button_label: data.button_label?.trim() ?? '',
        color: data.color,
        text_color: data.text_color ?? '#1F2937',
        icon: data.icon ?? null,
        show_to_creator: data.show_to_creator ?? false,
        silent_transition: data.silent_transition ?? false,
        is_default: data.is_default ?? false,
        is_final: data.is_final ?? false,
        final_kind: data.final_kind ?? null,
      }
      const tplPayload = {
        order_index: data.order_index ?? 0,
        is_default: data.is_default ?? false,
        is_final: data.is_final ?? false,
      }

      if (editing) {
        const { error: e1 } = await supabase
          .from('statuses')
          .update(sharedPayload)
          .eq('id', editing.id)
        if (e1) throw e1
        const { error: e2 } = await supabase
          .from('project_template_statuses')
          .update(tplPayload)
          .eq('template_id', projectTemplateId)
          .eq('status_id', editing.id)
        if (e2) throw e2
      } else {
        const { data: created, error: e1 } = await supabase
          .from('statuses')
          .insert({
            workspace_id: workspaceId,
            entity_type: 'project',
            ...sharedPayload,
          })
          .select('id')
          .single()
        if (e1) throw e1
        const { error: e2 } = await supabase.from('project_template_statuses').insert({
          template_id: projectTemplateId,
          status_id: created.id,
          ...tplPayload,
        })
        if (e2) throw e2
      }
    },
    onSuccess: (_, { editing }) => {
      toast.success(editing ? 'Статус обновлён' : 'Статус создан')
      invalidateAll()
    },
    onError: (err) => toast.error(getUserFacingErrorMessage(err, 'Не удалось сохранить')),
  })

  // Подключение существующих статусов из справочника — записи в junction.
  const linkMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const baseOrder = statuses.length
      const rows = ids.map((id, i) => ({
        template_id: projectTemplateId,
        status_id: id,
        order_index: baseOrder + i,
        is_default: false,
        is_final: false,
      }))
      const { error } = await supabase.from('project_template_statuses').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статусы добавлены')
      invalidateAll()
    },
    onError: (err) => toast.error(getUserFacingErrorMessage(err, 'Не удалось добавить')),
  })

  // Удаление «из шаблона» — отвязка через junction. Справочный статус остаётся.
  const unlinkMutation = useMutation({
    mutationFn: async (statusId: string) => {
      const { error } = await supabase
        .from('project_template_statuses')
        .delete()
        .eq('template_id', projectTemplateId)
        .eq('status_id', statusId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Статус убран из шаблона')
      invalidateAll()
    },
    onError: (err) => toast.error(getUserFacingErrorMessage(err, 'Не удалось убрать')),
  })

  // Реассайн: переводим проекты этого шаблона на новый статус, затем отвязываем.
  const reassignAndUnlinkMutation = useMutation({
    mutationFn: async ({
      statusId,
      replacementId,
    }: {
      statusId: string
      replacementId: string | null
    }) => {
      const { error: updErr } = await supabase
        .from('projects')
        .update({ status_id: replacementId })
        .eq('status_id', statusId)
        .eq('template_id', projectTemplateId)
      if (updErr) throw updErr
      const { error: delErr } = await supabase
        .from('project_template_statuses')
        .delete()
        .eq('template_id', projectTemplateId)
        .eq('status_id', statusId)
      if (delErr) throw delErr
    },
    onSuccess: () => {
      toast.success('Статус убран, проекты перенесены')
      invalidateAll()
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(workspaceId) })
    },
    onError: (err) => toast.error(getUserFacingErrorMessage(err, 'Не удалось')),
  })

  const reorderMutation = useMutation({
    mutationFn: async (reordered: TemplateProjectStatus[]) => {
      const updates = reordered.map((s, i) =>
        supabase
          .from('project_template_statuses')
          .update({ order_index: i })
          .eq('template_id', projectTemplateId)
          .eq('status_id', s.id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onError: () => {
      toast.error('Не удалось изменить порядок')
      invalidateAll()
    },
  })

  return {
    tplKey,
    saveMutation,
    linkMutation,
    unlinkMutation,
    reassignAndUnlinkMutation,
    reorderMutation,
  }
}
