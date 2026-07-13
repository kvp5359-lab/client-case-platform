"use client"

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ChevronDown, Loader2, Megaphone, Plus, Settings2, User } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
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
import { useGlobalThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { BotIntegration, DialogState } from './types'

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
  onAction,
  onSaved,
}: {
  bot: BotIntegration
  employees: WorkspaceParticipant[]
  templates: ThreadTemplate[]
  onAction: (state: DialogState) => void
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState(bot.config.template_id ?? '')
  const [responsible, setResponsible] = useState<string[]>(
    bot.config.responsible_user_ids ?? [],
  )
  const [welcome, setWelcome] = useState(bot.config.welcome_message ?? '')
  const [campaign, setCampaign] = useState(bot.config.base_campaign ?? '')
  const [showSenderName, setShowSenderName] = useState(
    bot.config.show_sender_name ?? false,
  )

  const botAvatarUrl = bot.config.bot_avatar_url
  const label = bot.config.bot_username
    ? `@${bot.config.bot_username}`
    : bot.config.bot_display_name || 'Бот без токена'

  const saveMutation = useMutation({
    mutationFn: async () => {
      const newConfig = {
        ...bot.config,
        template_id: templateId || undefined,
        responsible_user_ids: responsible,
        // Главный ответственный (owner нового диалога) — первый в списке.
        // При заданном шаблоне доступ дают исполнители шаблона (task_assignees).
        owner_user_id: responsible[0],
        welcome_message: welcome.trim() || undefined,
        base_campaign: campaign.trim() || undefined,
        show_sender_name: showSenderName,
      }
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

  const toggleResponsible = (userId: string) => {
    setResponsible((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5">
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
        <div className="border-t px-3 py-3 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Шаблон диалога</Label>
            <Select
              value={templateId || '__none__'}
              onValueChange={(v) => setTemplateId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="— без шаблона —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— без шаблона —</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Задаёт иконку, цвет, статус, срок и исполнителей нового диалога. Без
              шаблона — иконка/цвет как у «Личного Telegram», а исполнители берутся
              из списка ответственных ниже.
            </p>
          </div>

          {!templateId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Ответственные (все видят входящие диалоги)</Label>
              {employees.length === 0 ? (
                <p className="text-xs text-muted-foreground">Нет сотрудников в воркспейсе.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {employees.map((p) => {
                    if (!p.user_id) return null
                    const uid = p.user_id
                    const name =
                      [p.name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={responsible.includes(uid)}
                          onCheckedChange={() => toggleResponsible(uid)}
                        />
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Первый в списке — владелец диалога; остальные добавляются в участники.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`welcome-${bot.id}`}>
              Приветствие (первое сообщение клиенту)
            </Label>
            <Textarea
              id={`welcome-${bot.id}`}
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              placeholder="Здравствуйте! Спасибо за обращение. Чем можем помочь?"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`campaign-${bot.id}`}>
              Базовая метка кампании (необязательно)
            </Label>
            <Input
              id={`campaign-${bot.id}`}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Например: реклама-instagram"
            />
            <p className="text-[11px] text-muted-foreground">
              Проставляется каждому диалогу. Детализация приходит из ссылки{' '}
              <code className="text-[10px]">?start=…</code>.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm px-1 cursor-pointer">
            <Checkbox
              className="mt-0.5"
              checked={showSenderName}
              onCheckedChange={(v) => setShowSenderName(v === true)}
            />
            <span>
              Показывать имя отправителя клиенту
              <span className="block text-[11px] text-muted-foreground">
                Если ботом отвечают несколько сотрудников — перед сообщением будет
                видно, кто пишет («Имя: …»). По умолчанию выключено.
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
