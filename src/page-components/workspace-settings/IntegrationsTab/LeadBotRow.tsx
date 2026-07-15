"use client"

import { ChevronDown, Loader2, Megaphone, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ParticipantsPicker } from '@/components/participants/ParticipantsPicker'
import { ThreadTemplateDialog } from '@/components/templates/ThreadTemplateDialog'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads.types'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import { FieldRow, HelpHint } from './leadBotFields'
import { useLeadBotSettings } from './useLeadBotSettings'
import type { BotIntegration, DialogState } from './types'

export function LeadBotRow({
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
  const {
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
  } = useLeadBotSettings({ bot, employees, templates, onSaved })

  const botAvatarUrl = bot.config.bot_avatar_url
  const label = bot.config.bot_username
    ? `@${bot.config.bot_username}`
    : bot.config.bot_display_name || 'Бот без токена'

  // Список для пикера — тот же компонент, что в «Исполнителях» проекта.
  const pickerParticipants = employees.map((p) => ({
    id: p.id,
    name: [p.name, p.last_name].filter(Boolean).join(' ') || p.email || '—',
    avatar_url: p.avatar_url ?? null,
    workspace_roles: p.workspace_roles ?? [],
  }))

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
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
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
              templateSaved && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setTemplateDialogOpen(true)}
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
            {!!templateId && !templateSaved && (
              <p className="text-[11px] text-muted-foreground">
                Сохраните — тогда шаблон можно будет настроить для этого бота.
              </p>
            )}
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
          // Исполнителями привязки управляет поле «Дополнительные исполнители»
          // (режим «дополнить», которого в форме нет).
          hideAssignees
          onSave={(data) => saveTemplateMutation.mutate(data)}
          isPending={saveTemplateMutation.isPending}
        />
      )}
    </div>
  )
}
