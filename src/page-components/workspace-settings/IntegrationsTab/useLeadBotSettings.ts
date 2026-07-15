"use client"

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { threadTemplateKeys } from '@/hooks/queryKeys'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import { buildLeadBotConfig } from './leadBotConfig'
import type { BotIntegration } from './types'

/**
 * Состояние формы лид-бота + работа с его привязкой к шаблону диалога.
 *
 * Привязка (project_template_thread_templates с владельцем integration_id) —
 * тот же механизм «базовый шаблон + переопределения», что у шаблонов проекта:
 * канал просто ещё один владелец переопределений, и правятся они тем же
 * диалогом шаблона (включая исполнителей). Своих полей «про шаблон» у бота нет.
 *
 * Поле «Ответственные» в блоке бота — легаси-путь для ботов БЕЗ шаблона: там
 * они идут во владельца диалога и участников треда, к шаблонам отношения не имеют.
 */
export function useLeadBotSettings({
  bot,
  employees,
  templates,
  onSaved,
}: {
  bot: BotIntegration
  employees: WorkspaceParticipant[]
  templates: ThreadTemplate[]
  onSaved: () => void
}) {
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState(bot.config.template_id ?? '')
  // Исполнители держим в participant_id (как в привязке и в пикере проекта).
  // Легаси-config хранит user_id → резолвим при инициализации.
  const [responsible, setResponsible] = useState<string[]>(() => {
    const uids = new Set(bot.config.responsible_user_ids ?? [])
    return employees.filter((p) => p.user_id && uids.has(p.user_id)).map((p) => p.id)
  })
  const [welcome, setWelcome] = useState(bot.config.welcome_message ?? '')
  const [campaign, setCampaign] = useState(bot.config.base_campaign ?? '')
  const [showSenderName, setShowSenderName] = useState(bot.config.show_sender_name ?? false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  const selectedTemplate = templates.find((t) => t.id === templateId)
  /** Шаблон уже записан в конфиг бота — только тогда есть что переопределять.
   *  Пока выбор не сохранён, привязку не создаём: иначе при уходе без
   *  «Сохранить» она осталась бы сиротой (приём читает config.template_id). */
  const templateSaved = !!templateId && bot.config.template_id === templateId

  const bindingKeys = {
    template: ['lead-bot-binding-template', bot.id, templateId] as const,
  }

  /** Находит/создаёт строку-привязку канала к шаблону (общий механизм). */
  const ensureBinding = async (): Promise<string> => {
    const { data: existing } = await supabase
      .from('project_template_thread_templates')
      .select('id')
      .eq('integration_id', bot.id)
      .eq('thread_template_id', templateId)
      .maybeSingle()
    if (existing?.id) return existing.id
    const { data: created, error } = await supabase
      .from('project_template_thread_templates')
      .insert({ integration_id: bot.id, thread_template_id: templateId })
      .select('id')
      .single()
    if (error) throw error
    return created.id
  }

  // Шаблон + переопределения ЭТОГО канала для редактора. Диалог включает режим
  // «Из общего · переопределить» сам, увидев projectOverride. Привязки может
  // ещё не быть — тогда отдаём «пустое» переопределение (всё наследуется),
  // а строка создастся при сохранении.
  const { data: channelTemplate } = useQuery({
    queryKey: bindingKeys.template,
    queryFn: async (): Promise<ThreadTemplate | null> => {
      if (!selectedTemplate) return null
      const { data: b } = await supabase
        .from('project_template_thread_templates')
        .select(
          'id, sort_order, default_status_id, on_complete_set_project_status_id, deadline_days, initial_message_html, access_type, access_roles, assignees_mode',
        )
        .eq('integration_id', bot.id)
        .eq('thread_template_id', templateId)
        .maybeSingle()
      const { data: a } = b?.id
        ? await supabase
            .from('project_template_thread_assignees')
            .select('participant_id')
            .eq('binding_id', b.id)
        : { data: [] }
      return {
        ...selectedTemplate,
        sort_order: b?.sort_order ?? selectedTemplate.sort_order,
        default_status_id: b?.default_status_id ?? null,
        on_complete_set_project_status_id: b?.on_complete_set_project_status_id ?? null,
        projectOverride: {
          bindingId: b?.id,
          deadline_days: b?.deadline_days ?? null,
          initial_message_html: b?.initial_message_html ?? null,
          access_type: (b?.access_type as 'all' | 'roles' | null) ?? null,
          access_roles: b?.access_roles ?? null,
          assignees_overridden: b?.assignees_mode === 'override',
          override_assignee_ids: (a ?? []).map((r) => r.participant_id),
        },
      }
    },
    enabled: templateDialogOpen && !!selectedTemplate,
  })

  // participant_id → user_id (легаси-config и владелец диалога — в user_id).
  const responsibleUserIds = employees
    .filter((p) => p.user_id && responsible.includes(p.id))
    .map((p) => p.user_id!)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const newConfig = buildLeadBotConfig(bot.config, {
        templateId,
        responsibleUserIds,
        welcome,
        campaign,
        showSenderName,
      })
      const { error } = await supabase
        .from('workspace_integrations')
        .update({ config: newConfig })
        .eq('id', bot.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Настройки лид-бота сохранены')
      onSaved()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить')
    },
  })

  // Редактор шаблона (тот же, что в разделе «Шаблоны»). Пришли переопределения
  // канала — пишем ИХ в привязку; базовый шаблон общий, его тело этим путём не
  // трогаем. Исполнители — здесь же: единственное место, где их переопределяют.
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: ThreadTemplateFormData) => {
      const po = data.projectOverride
      if (po) {
        const bindingId = po.bindingId ?? (await ensureBinding())
        const { error: jErr } = await supabase
          .from('project_template_thread_templates')
          .update({
            default_status_id: data.default_status_id,
            on_complete_set_project_status_id: data.on_complete_set_project_status_id,
            deadline_days: po.deadline_days,
            initial_message_html: po.initial_message_html,
            access_type: po.access_type,
            access_roles: po.access_roles,
            assignees_mode: po.assignees_overridden ? 'override' : 'inherit',
          })
          .eq('id', bindingId)
        if (jErr) throw jErr

        // Набор переопределённых исполнителей переписываем целиком.
        const { error: delErr } = await supabase
          .from('project_template_thread_assignees')
          .delete()
          .eq('binding_id', bindingId)
        if (delErr) throw delErr
        if (po.assignees_overridden && po.override_assignee_ids.length > 0) {
          const { error: aErr } = await supabase
            .from('project_template_thread_assignees')
            .insert(
              po.override_assignee_ids.map((pid) => ({
                binding_id: bindingId,
                participant_id: pid,
              })),
            )
          if (aErr) throw aErr
        }
        return
      }

      // Без переопределений — правка тела общего шаблона.
      const { assignee_ids, projectOverride: _po, ...body } = data
      const { error } = await supabase.rpc('update_thread_template_with_assignees', {
        p_template_id: templateId,
        p_updates: body,
        p_assignee_ids: assignee_ids ?? [],
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Шаблон сохранён')
      queryClient.invalidateQueries({ queryKey: threadTemplateKeys.all })
      queryClient.invalidateQueries({ queryKey: bindingKeys.template })
      setTemplateDialogOpen(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить шаблон')
    },
  })

  return {
    open,
    setOpen,
    templateId,
    setTemplateId,
    selectedTemplate,
    templateSaved,
    responsible,
    setResponsible,
    welcome,
    setWelcome,
    campaign,
    setCampaign,
    showSenderName,
    setShowSenderName,
    templateDialogOpen,
    setTemplateDialogOpen,
    channelTemplate,
    saveMutation,
    saveTemplateMutation,
  }
}
