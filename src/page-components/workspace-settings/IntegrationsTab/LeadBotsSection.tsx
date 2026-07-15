"use client"

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, HelpCircle, Loader2, Megaphone, Plus, Settings2 } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParticipantsPicker } from '@/components/participants/ParticipantsPicker'
import { useGlobalThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import { ThreadTemplateDialog } from '@/components/templates/ThreadTemplateDialog'
import { threadTemplateKeys } from '@/hooks/queryKeys'
import type { ThreadTemplateFormData } from '@/types/threadTemplate'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads.types'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { BotIntegration, DialogState } from './types'

/** Подсказка «?» рядом с подписью поля — вместо простыни поясняющего текста. */
function HelpHint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-muted-foreground"
            aria-label="Подсказка"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs text-xs font-normal">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Строка настройки: подпись + «?» + опциональное действие справа. */
function FieldRow({
  label,
  hint,
  action,
  children,
}: {
  label: string
  hint: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">{label}</Label>
          <HelpHint text={hint} />
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

type LeadBotsSectionProps = {
  workspaceId: string
  leadBots: BotIntegration[]
  employees: WorkspaceParticipant[]
  onAction: (state: DialogState) => void
  onSaved: () => void
}

export function LeadBotsSection({
  workspaceId,
  leadBots,
  employees,
  onAction,
  onSaved,
}: LeadBotsSectionProps) {
  // Шаблоны диалога (иконка/цвет/статус/дедлайн/исполнители нового чата).
  // Библиотека воркспейса; email-шаблоны отсекаем — лид-диалог идёт в Telegram.
  const { data: allTemplates = [] } = useGlobalThreadTemplates(workspaceId)
  const templates = allTemplates.filter((t) => !t.is_email)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
            <Megaphone className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base">Лид-боты (реклама)</CardTitle>
            <CardDescription className="mt-0.5">
              Отдельный бот, которого можно рекламировать. Клиент пишет ему в личку по ссылке
              из рекламы — в CRM автоматически появляется диалог с меткой кампании. Дальше
              переписку ведёт назначенная команда прямо из системы. Ботов можно завести
              несколько — например, под каждое направление или объявление.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {leadBots.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {leadBots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет ни одного лид-бота. Создайте бота в @BotFather и добавьте его токен.
          </p>
        ) : (
          leadBots.map((bot) => (
            <LeadBotRow
              key={bot.id}
              bot={bot}
              employees={employees}
              templates={templates}
              workspaceId={workspaceId}
              onAction={onAction}
              onSaved={onSaved}
            />
          ))
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() =>
            onAction({
              title: 'Новый лид-бот',
              bot: null,
              createParams: {
                workspace_id: workspaceId,
                type: 'telegram_lead_bot',
                config: {},
              },
            })
          }
        >
          <Plus className="h-4 w-4 mr-1" />
          Добавить лид-бота
        </Button>

        <p className="text-xs text-muted-foreground pt-1">
          Бот создаётся в{' '}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            @BotFather
          </a>{' '}
          (команды «/newbot», «/setname», «/setuserpic»). Рекламная ссылка с меткой:{' '}
          <code className="text-[11px]">t.me/ваш_бот?start=промо1</code>.
        </p>
      </CardContent>
    </Card>
  )
}

function LeadBotRow({
  bot,
  employees,
  templates,
  workspaceId,
  onAction,
  onSaved,
}: {
  bot: BotIntegration
  employees: WorkspaceParticipant[]
  templates: ThreadTemplate[]
  workspaceId: string
  onAction: (state: DialogState) => void
  onSaved: () => void
}) {
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
  const [showSenderName, setShowSenderName] = useState(
    bot.config.show_sender_name ?? false,
  )
  const [syncedBindingKey, setSyncedBindingKey] = useState<string | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const queryClient = useQueryClient()

  // Переопределение исполнителей живёт в привязке канала (источник правды для
  // приёма) — читаем оттуда, а не из config, чтобы UI и приём не расходились.
  const { data: bindingOverride } = useQuery({
    queryKey: ['lead-bot-binding-assignees', bot.id, templateId],
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
    enabled: open && !!templateId,
  })

  // Подтягиваем загруженное переопределение в форму (adjust state on change,
  // без эффекта — паттерн проекта).
  const loadedKey = bindingOverride ? `${bot.id}:${templateId}` : null
  if (bindingOverride && loadedKey && loadedKey !== syncedBindingKey) {
    setSyncedBindingKey(loadedKey)
    setResponsible(bindingOverride)
  }

  const botAvatarUrl = bot.config.bot_avatar_url
  const label = bot.config.bot_username
    ? `@${bot.config.bot_username}`
    : bot.config.bot_display_name || 'Бот без токена'

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

  // Шаблон + переопределения ЭТОГО канала. Диалог включает режим
  // «Из общего · переопределить» сам, увидев projectOverride.
  const { data: channelTemplate } = useQuery({
    queryKey: ['lead-bot-binding-template', bot.id, templateId],
    queryFn: async (): Promise<ThreadTemplate | null> => {
      if (!selectedTemplate) return null
      const { data: b } = await supabase
        .from('project_template_thread_templates')
        .select(
          'id, sort_order, default_status_id, on_complete_set_project_status_id, deadline_days, initial_message_html, access_type, access_roles, override_assignees',
        )
        .eq('integration_id', bot.id)
        .eq('thread_template_id', templateId)
        .maybeSingle()
      if (!b?.id) return null
      const { data: a } = await supabase
        .from('project_template_thread_assignees')
        .select('participant_id')
        .eq('binding_id', b.id)
      return {
        ...selectedTemplate,
        sort_order: b.sort_order,
        default_status_id: b.default_status_id,
        on_complete_set_project_status_id: b.on_complete_set_project_status_id,
        projectOverride: {
          bindingId: b.id,
          deadline_days: b.deadline_days,
          initial_message_html: b.initial_message_html,
          access_type: b.access_type as 'all' | 'roles' | null,
          access_roles: b.access_roles,
          assignees_overridden: b.override_assignees,
          override_assignee_ids: (a ?? []).map((r) => r.participant_id),
        },
      }
    },
    enabled: templateDialogOpen && !!selectedTemplate,
  })

  // Список для пикера — тот же компонент, что в «Исполнителях» проекта.
  const pickerParticipants = employees.map((p) => ({
    id: p.id,
    name: [p.name, p.last_name].filter(Boolean).join(' ') || p.email || '—',
    avatar_url: p.avatar_url ?? null,
    workspace_roles: p.workspace_roles ?? [],
  }))

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
        // Владелец нового диалога — первый в списке.
        owner_user_id: responsibleUserIds[0],
        welcome_message: templateId ? undefined : welcome.trim() || undefined,
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
      const overridePids = responsible

      const bindingId = await ensureBinding()
      // «Дополнительные» — режим extend: исполнители шаблона остаются,
      // указанные здесь добавляются к ним (не заменяют).
      const { error: upErr } = await supabase
        .from('project_template_thread_templates')
        .update({ assignees_mode: overridePids.length > 0 ? 'extend' : 'inherit' })
        .eq('id', bindingId)
      if (upErr) throw upErr

      // Переопределение исполнителей канала — переписываем набор целиком.
      const { error: delErr } = await supabase
        .from('project_template_thread_assignees')
        .delete()
        .eq('binding_id', bindingId)
      if (delErr) throw delErr
      if (overridePids.length > 0) {
        const { error: aErr } = await supabase
          .from('project_template_thread_assignees')
          .insert(overridePids.map((pid) => ({ binding_id: bindingId, participant_id: pid })))
        if (aErr) throw aErr
      }
    },
    onSuccess: () => {
      toast.success('Настройки лид-бота сохранены')
      queryClient.invalidateQueries({
        queryKey: ['lead-bot-binding-assignees', bot.id, templateId],
      })
      onSaved()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить')
    },
  })

  // Редактор шаблона из раздела «Шаблоны». Если пришли переопределения канала —
  // пишем ИХ в привязку (базовый шаблон общий, его тело не трогаем этим путём).
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
            override_assignees: po.assignees_overridden,
          })
          .eq('id', bindingId)
        if (jErr) throw jErr

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
      queryClient.invalidateQueries({
        queryKey: ['lead-bot-binding-template', bot.id, templateId],
      })
      queryClient.invalidateQueries({
        queryKey: ['lead-bot-binding-assignees', bot.id, templateId],
      })
      setTemplateDialogOpen(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить шаблон')
    },
  })

  /** Открыть редактор переопределений: привязка должна существовать. */
  const openTemplateDialog = async () => {
    try {
      await ensureBinding()
      await queryClient.invalidateQueries({
        queryKey: ['lead-bot-binding-template', bot.id, templateId],
      })
      setTemplateDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось открыть настройки шаблона')
    }
  }


  return (
    <div className="rounded-md border bg-card shadow-sm">
      {/* Шапка бота: своя подложка, чтобы отделяться от настроек под ней. */}
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-3 py-2 bg-muted/40',
          open ? 'rounded-t-md border-b' : 'rounded-md',
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {botAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={botAvatarUrl}
              alt=""
              className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
            />
          ) : (
            <div className="h-7 w-7 rounded-full shrink-0 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
              <Megaphone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
          )}
          <span className="font-medium text-sm truncate">{label}</span>
          {responsible.length > 0 && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {responsible.length} отв.
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            <Settings2 className="h-4 w-4 mr-1" />
            Настройки
            <ChevronDown
              className={`h-3.5 w-3.5 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction({ title: `Лид-бот: ${label}`, bot, createParams: null })}
          >
            Токен
          </Button>
        </div>
      </div>

      {open && (
        <div className="px-3 py-3 space-y-3">
          <FieldRow
            label="Шаблон диалога"
            hint="Задаёт вид и параметры нового диалога: иконку, цвет, статус, срок, исполнителей и приветствие. Без шаблона — вид как у «Личного Telegram»."
            action={
              selectedTemplate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void openTemplateDialog()}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" />
                  Настроить
                </Button>
              )
            }
          >
            <Select
              value={templateId || '__none__'}
              onValueChange={(v) => setTemplateId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="— без шаблона —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— без шаблона —</SelectItem>
                {templates.map((t) => {
                  const Icon = getChatIconComponent(t.icon)
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <Icon
                          className={`h-3.5 w-3.5 ${COLOR_TEXT[t.accent_color as ThreadAccentColor] ?? ''}`}
                        />
                        {t.name}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            label={templateId ? 'Дополнительные исполнители' : 'Ответственные'}
            hint={
              templateId
                ? 'Добавляются к исполнителям шаблона, не заменяя их. Все назначенные видят входящие диалоги этого бота.'
                : 'Кто ведёт входящие диалоги этого бота. Первый в списке — владелец диалога, остальные добавляются в участники.'
            }
          >
            {employees.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет сотрудников в воркспейсе.</p>
            ) : (
              <ParticipantsPicker
                participants={pickerParticipants}
                selectedIds={responsible}
                onChange={setResponsible}
                placeholder="Выберите участников..."
              />
            )}
          </FieldRow>

          {!templateId && (
            <FieldRow
              label="Приветствие"
              hint="Первое сообщение, которое бот отправит клиенту при первом контакте. С шаблоном берётся из его «Первого сообщения»."
            >
              <Textarea
                value={welcome}
                onChange={(e) => setWelcome(e.target.value)}
                placeholder="Здравствуйте! Спасибо за обращение. Чем можем помочь?"
                rows={3}
              />
            </FieldRow>
          )}

          <FieldRow
            label="Метка кампании"
            hint="Проставляется каждому диалогу этого бота — видно, откуда пришёл лид. Детализация приходит из рекламной ссылки: t.me/бот?start=промо1"
          >
            <Input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Например: реклама-instagram"
            />
          </FieldRow>

          <div className="flex items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={showSenderName}
                onCheckedChange={(v) => setShowSenderName(v === true)}
              />
              Показывать имя отправителя
              <HelpHint text="Если боту отвечают несколько сотрудников — перед сообщением клиент увидит, кто пишет («Имя: …»). По умолчанию выключено." />
            </label>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {selectedTemplate && (
        <ThreadTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          workspaceId={workspaceId}
          template={channelTemplate ?? selectedTemplate}
          onSave={(data) => saveTemplateMutation.mutate(data)}
          isPending={saveTemplateMutation.isPending}
        />
      )}
    </div>
  )
}
