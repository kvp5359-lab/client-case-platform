"use client"

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { threadTemplateKeys } from '@/hooks/queryKeys'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { BotIntegration } from './types'

/**
 * Состояние формы лид-бота + работа с его привязкой к шаблону диалога.
 *
 * Привязка (project_template_thread_templates с владельцем integration_id) —
 * тот же механизм «шаблон + переопределения», что у шаблонов проекта. Источник
 * правды об исполнителях привязки — assignees_mode; здесь мы пишем только
 * 'extend' («дополнить исполнителей шаблона») либо 'inherit'.
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
  const [syncedBindingKey, setSyncedBindingKey] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  const selectedTemplate = templates.find((t) => t.id === templateId)
  /** Шаблон уже записан в конфиг бота — только тогда есть что переопределять.
   *  Пока выбор не сохранён, привязку не создаём: иначе при уходе без
   *  «Сохранить» она осталась бы сиротой (приём читает config.template_id). */
  const templateSaved = !!templateId && bot.config.template_id === templateId

  const bindingKeys = {
    assignees: ['lead-bot-binding-assignees', bot.id, templateId] as const,
    template: ['lead-bot-binding-template', bot.id, templateId] as const,
  }

  // Дополнительные исполнители живут в привязке (источник правды для приёма) —
  // читаем оттуда, а не из config, чтобы UI и приём не расходились.
  const { data: bindingOverride } = useQuery({
    queryKey: bindingKeys.assignees,
    queryFn: async (): Promise<string[]> => {
      const { data: binding } = await supabase
        .from('project_template_thread_templates')
        .select('id, assignees_mode')
        .eq('integration_id', bot.id)
        .eq('thread_template_id', templateId)
        .maybeSingle()
      if (!binding?.id || binding.assignees_mode !== 'extend') return []
      const { data: rows } = await supabase
        .from('project_template_thread_assignees')
        .select('participant_id')
        .eq('binding_id', binding.id)
      return (rows ?? []).map((r) => r.participant_id)
    },
    enabled: open && templateSaved,
  })

  // Подтягиваем загруженное переопределение в форму (adjust state on change,
  // без эффекта — паттерн проекта).
  const loadedKey = bindingOverride ? `${bot.id}:${templateId}` : null
  if (bindingOverride && loadedKey && loadedKey !== syncedBindingKey) {
    setSyncedBindingKey(loadedKey)
    setResponsible(bindingOverride)
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
          'id, sort_order, default_status_id, on_complete_set_project_status_id, deadline_days, initial_message_html, access_type, access_roles',
        )
        .eq('integration_id', bot.id)
        .eq('thread_template_id', templateId)
        .maybeSingle()
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
          // Исполнителями привязки канала управляет поле «Дополнительные
          // исполнители» (режим extend, которого в форме нет) — поэтому в
          // редакторе блок скрыт (hideAssignees) и эти значения не читаются.
          assignees_overridden: false,
          override_assignee_ids: [],
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
      const newConfig = {
        ...bot.config,
        template_id: templateId || undefined,
        // Исполнители: при шаблоне — ТОЛЬКО в привязке (ниже), чтобы не
        // дублировать состояние; в config остаются лишь для легаси-ботов
        // без шаблона (там они идут в участники треда, поэтому в user_id).
        responsible_user_ids: templateId ? undefined : responsibleUserIds,
        // Владелец нового диалога. При шаблоне без дополнительных исполнителей
        // список пуст — тогда владельца выберет приём по исполнителям шаблона.
        owner_user_id: responsibleUserIds[0],
        // Приветствие при шаблоне не читается (берётся из его «первого
        // сообщения»), но и не стираем — иначе снятие шаблона потеряло бы текст.
        welcome_message: welcome.trim() || undefined,
        base_campaign: campaign.trim() || undefined,
        show_sender_name: showSenderName,
      }
      const { error } = await supabase
        .from('workspace_integrations')
        .update({ config: newConfig })
        .eq('id', bot.id)
      if (error) throw error

      if (!templateId) return

      // Единый механизм «шаблон + переопределения»: у канала своя строка-привязка
      // (та же таблица, что у проект-шаблонов, владелец = integration_id).
      // Partial unique (integration_id, thread_template_id) → PostgREST upsert по
      // нему не умеет (42P10), поэтому ручной select → insert/update.
      const bindingId = await ensureBinding()
      // «Дополнительные» — режим extend: исполнители шаблона остаются,
      // указанные здесь добавляются к ним (не заменяют).
      const { error: upErr } = await supabase
        .from('project_template_thread_templates')
        .update({ assignees_mode: responsible.length > 0 ? 'extend' : 'inherit' })
        .eq('id', bindingId)
      if (upErr) throw upErr

      // Набор дополнительных исполнителей переписываем целиком.
      const { error: delErr } = await supabase
        .from('project_template_thread_assignees')
        .delete()
        .eq('binding_id', bindingId)
      if (delErr) throw delErr
      if (responsible.length > 0) {
        const { error: aErr } = await supabase
          .from('project_template_thread_assignees')
          .insert(responsible.map((pid) => ({ binding_id: bindingId, participant_id: pid })))
        if (aErr) throw aErr
      }
    },
    onSuccess: () => {
      toast.success('Настройки лид-бота сохранены')
      queryClient.invalidateQueries({ queryKey: bindingKeys.assignees })
      onSaved()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить')
    },
  })

  // Редактор шаблона из раздела «Шаблоны». Если пришли переопределения канала —
  // пишем ИХ в привязку (базовый шаблон общий, его тело не трогаем этим путём).
  // Исполнителей здесь НЕ трогаем: ими управляет поле «Дополнительные
  // исполнители» (режим extend), и запись отсюда стирала бы его настройку.
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
          })
          .eq('id', bindingId)
        if (jErr) throw jErr
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
