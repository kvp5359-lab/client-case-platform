"use client"

/**
 * IntegrationsTab — единая страница интеграций воркспейса.
 *
 * Левый сайд-навигатор (Telegram / Gmail / Telegram Business) разделяет
 * содержимое на под-разделы, чтобы страница не превращалась в простыню.
 *
 * Telegram-раздел содержит:
 * - Боты-секретари (workspace_integrations type=telegram_workspace_bot):
 *   слушают групповые чаты, обрабатывают команды клиента. Если в БД
 *   есть токен — берётся он, иначе env-fallback.
 * - Личные боты сотрудников (type=telegram_employee_bot): по одному на
 *   (workspace × участник с командной ролью). Используются для отправки
 *   в группы от лица сотрудника с его именем и аватаркой.
 *
 * Gmail — read-only список подключённых ящиков.
 * Telegram Business — заглушка («Скоро»).
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageCircle, Mail, Sparkles, Loader2, User } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import {
  useWorkspaceParticipants,
  type WorkspaceParticipant,
} from '@/hooks/shared/useWorkspaceParticipants'

/**
 * Командные роли — те, кто работает в воркспейсе как сотрудник, а не как
 * клиент. Совпадает с TEAM_ROLES из мессенджера (MessageBubble.tsx).
 */
const TEAM_ROLES = new Set(['Владелец', 'Администратор', 'Сотрудник', 'Внешний сотрудник'])

interface BotIntegration {
  id: string
  type: 'telegram_workspace_bot' | 'telegram_employee_bot'
  is_active: boolean
  config: {
    bot_version?: string
    note?: string
    bot_username?: string
    bot_display_name?: string
    bot_id?: number
    owner_user_id?: string
  }
  has_token: boolean
}

interface DialogState {
  title: string
  bot: BotIntegration | null
  createParams: {
    workspace_id: string
    type: 'telegram_workspace_bot' | 'telegram_employee_bot'
    config: BotIntegration['config']
  } | null
}

interface EmailAccount {
  id: string
  email: string
  is_active: boolean | null
  watch_expires_at: string | null
}

type SectionKey = 'telegram' | 'gmail' | 'business'

export function IntegrationsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [section, setSection] = useState<SectionKey>('telegram')

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations', 'workspace-integrations', workspaceId],
    queryFn: async (): Promise<BotIntegration[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('workspace_integrations')
        .select('id, type, is_active, config, secrets')
        .eq('workspace_id', workspaceId)
        .in('type', ['telegram_workspace_bot', 'telegram_employee_bot'])
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        type: row.type as BotIntegration['type'],
        is_active: row.is_active,
        config: (row.config as BotIntegration['config']) ?? {},
        has_token: !!(row.secrets as { token?: string } | null)?.token,
      }))
    },
    enabled: !!workspaceId,
  })

  const workspaceBots = useMemo(
    () => integrations.filter((i) => i.type === 'telegram_workspace_bot'),
    [integrations],
  )
  const employeeBots = useMemo(
    () => integrations.filter((i) => i.type === 'telegram_employee_bot'),
    [integrations],
  )
  const employeeBotByUserId = useMemo(() => {
    const map = new Map<string, BotIntegration>()
    employeeBots.forEach((b) => {
      if (b.config.owner_user_id) map.set(b.config.owner_user_id, b)
    })
    return map
  }, [employeeBots])

  const { data: telegramGroups = 0 } = useQuery({
    queryKey: ['integrations', 'telegram-groups', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return 0
      const { count, error } = await supabase
        .from('project_telegram_chats')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!workspaceId,
  })

  const { data: emailAccounts = [] } = useQuery({
    queryKey: ['integrations', 'gmail-accounts', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('email_accounts')
        .select('id, email, is_active, watch_expires_at')
        .eq('workspace_id', workspaceId)
        .order('email', { ascending: true })
      if (error) throw error
      return (data ?? []) as EmailAccount[]
    },
    enabled: !!workspaceId,
  })

  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const employees = useMemo(
    () =>
      participants.filter((p) => {
        if (!p.user_id) return false
        const roles = p.workspace_roles ?? []
        return roles.some((r) => TEAM_ROLES.has(r))
      }),
    [participants],
  )

  const refreshIntegrations = () =>
    queryClient.invalidateQueries({
      queryKey: ['integrations', 'workspace-integrations', workspaceId],
    })

  const sections: Array<{ id: SectionKey; label: string; icon: typeof MessageCircle }> = [
    { id: 'telegram', label: 'Telegram', icon: MessageCircle },
    { id: 'gmail', label: 'Gmail', icon: Mail },
    { id: 'business', label: 'Telegram Business', icon: Sparkles },
  ]

  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 flex flex-col gap-0.5">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ' +
              (section === s.id
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')
            }
          >
            <s.icon className="h-4 w-4 shrink-0" />
            {s.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0 space-y-4">
        {section === 'telegram' && (
          <>
            <TelegramSecretarySection
              workspaceBots={workspaceBots}
              telegramGroups={telegramGroups}
              onEdit={(bot) =>
                setDialog({ title: 'Токен бота-секретаря', bot, createParams: null })
              }
            />
            <EmployeeBotsSection
              employees={employees}
              employeeBots={employeeBots}
              employeeBotByUserId={employeeBotByUserId}
              workspaceId={workspaceId!}
              onAction={setDialog}
            />
          </>
        )}
        {section === 'gmail' && <GmailSection emailAccounts={emailAccounts} />}
        {section === 'business' && <TelegramBusinessSection />}
      </div>

      <BotTokenDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSaved={refreshIntegrations}
      />
    </div>
  )
}

interface TelegramSecretarySectionProps {
  workspaceBots: BotIntegration[]
  telegramGroups: number
  onEdit: (bot: BotIntegration) => void
}

function TelegramSecretarySection({
  workspaceBots,
  telegramGroups,
  onEdit,
}: TelegramSecretarySectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
            <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Бот-секретарь</CardTitle>
            <CardDescription className="mt-0.5">
              Бот, добавляемый в групповые чаты с клиентами. Слушает входящие, обрабатывает
              команды клиента в группе.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          Групп: {telegramGroups}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {workspaceBots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Бот не подключён.</p>
        ) : (
          workspaceBots.map((bot) => (
            <div
              key={bot.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card"
            >
              <div className="flex flex-col text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {bot.config.bot_display_name ||
                      (bot.config.bot_version === 'v2' ? 'Бот v2' : 'Бот v1')}
                  </span>
                  {bot.config.bot_username && (
                    <span className="text-xs text-muted-foreground font-mono">
                      @{bot.config.bot_username}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  {bot.has_token ? (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      Токен в БД
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Использует env-fallback
                    </Badge>
                  )}
                  {bot.config.bot_version && <span>версия: {bot.config.bot_version}</span>}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onEdit(bot)}>
                {bot.has_token ? 'Изменить' : 'Указать токен'}
              </Button>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground pt-1">
          Токен бота получается у{' '}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            @BotFather
          </a>{' '}
          (команда «/newbot» или «/mybots → API Token» для существующего бота).
        </p>
      </CardContent>
    </Card>
  )
}

interface EmployeeBotsSectionProps {
  employees: WorkspaceParticipant[]
  employeeBots: BotIntegration[]
  employeeBotByUserId: Map<string, BotIntegration>
  workspaceId: string
  onAction: (state: DialogState) => void
}

function EmployeeBotsSection({
  employees,
  employeeBots,
  employeeBotByUserId,
  workspaceId,
  onAction,
}: EmployeeBotsSectionProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <CardTitle className="text-base">Личные боты сотрудников</CardTitle>
            <CardDescription className="mt-0.5">
              У каждого сотрудника может быть свой Telegram-бот с его именем и аватаркой. При
              отправке сообщений в группу клиент видит «Денис Крылов» с правильной аватаркой,
              а не общего бота-секретаря с приставкой имени в тексте.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {employeeBots.length} / {employees.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В воркспейсе нет сотрудников — список основан на участниках с командными ролями
            (Владелец, Администратор, Сотрудник, Внешний сотрудник).
          </p>
        ) : (
          employees.map((p) => {
            const bot = p.user_id ? employeeBotByUserId.get(p.user_id) : undefined
            const fullName = [p.name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card"
              >
                <div className="flex flex-col text-sm min-w-0">
                  <span className="font-medium truncate">{fullName}</span>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {bot ? (
                      <>
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          Бот подключён
                        </Badge>
                        {bot.config.bot_username && (
                          <span className="font-mono">@{bot.config.bot_username}</span>
                        )}
                      </>
                    ) : (
                      <span>Личный бот не подключён</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!p.user_id}
                  onClick={() =>
                    onAction({
                      title: `Личный бот: ${fullName}`,
                      bot: bot ?? null,
                      createParams: bot
                        ? null
                        : {
                            workspace_id: workspaceId,
                            type: 'telegram_employee_bot',
                            config: { owner_user_id: p.user_id! },
                          },
                    })
                  }
                >
                  {bot ? 'Изменить' : 'Подключить'}
                </Button>
              </div>
            )
          })
        )}
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
          (команды «/newbot», «/setname», «/setuserpic», «/setprivacy»→Enable). Готового бота
          нужно вручную добавить в нужные клиентские группы.
        </p>
      </CardContent>
    </Card>
  )
}

function GmailSection({ emailAccounts }: { emailAccounts: EmailAccount[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-base">Gmail</CardTitle>
            <CardDescription className="mt-0.5">
              Подключённые ящики для отправки и получения писем по проектам.
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {emailAccounts.length > 0 ? `${emailAccounts.length} ящик(ов)` : 'Нет ящиков'}
        </Badge>
      </CardHeader>
      <CardContent className="text-sm">
        {emailAccounts.length === 0 ? (
          <p className="text-muted-foreground">
            Ящики пока не подключены. Подключение — через карточку проекта (раздел «Почта»).
          </p>
        ) : (
          <ul className="space-y-1">
            {emailAccounts.map((acc) => (
              <li key={acc.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-foreground">{acc.email}</span>
                {!acc.is_active && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    выкл
                  </Badge>
                )}
                {acc.watch_expires_at && new Date(acc.watch_expires_at) < new Date() && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    watch истёк
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TelegramBusinessSection() {
  return (
    <Card className="opacity-70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-base">Telegram Business</CardTitle>
            <CardDescription className="mt-0.5">
              Личные аккаунты менеджеров с Telegram Premium — подключение бота-ассистента к их
              личной переписке с клиентами.
            </CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs">
          Скоро
        </Badge>
      </CardHeader>
    </Card>
  )
}

interface BotTokenDialogProps {
  state: DialogState | null
  onClose: () => void
  onSaved: () => void
}

interface TelegramGetMe {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

function BotTokenDialog({ state, onClose, onSaved }: BotTokenDialogProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!state) throw new Error('Не выбран бот')
      const trimmed = token.trim()
      if (!trimmed) throw new Error('Введите токен')

      let me: TelegramGetMe
      try {
        const res = await fetch(`https://api.telegram.org/bot${trimmed}/getMe`)
        const json = (await res.json()) as {
          ok: boolean
          result?: TelegramGetMe
          description?: string
        }
        if (!json.ok || !json.result) {
          throw new Error(json.description || 'Telegram отверг токен')
        }
        me = json.result
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? `Не удалось проверить токен: ${err.message}`
            : 'Не удалось проверить токен',
        )
      }

      const baseConfig = state.bot?.config ?? state.createParams?.config ?? {}
      const newConfig = {
        ...baseConfig,
        bot_id: me.id,
        bot_username: me.username,
        bot_display_name: me.first_name,
      }

      if (state.bot) {
        const { error: updErr } = await supabase
          .from('workspace_integrations')
          .update({ secrets: { token: trimmed }, config: newConfig })
          .eq('id', state.bot.id)
        if (updErr) throw updErr
      } else if (state.createParams) {
        const { error: insErr } = await supabase.from('workspace_integrations').insert({
          workspace_id: state.createParams.workspace_id,
          type: state.createParams.type,
          config: newConfig,
          secrets: { token: trimmed },
          is_active: true,
        })
        if (insErr) throw insErr
      } else {
        throw new Error('Невозможный сценарий: ни bot, ни createParams не заданы')
      }
    },
    onSuccess: () => {
      toast.success('Токен сохранён')
      setToken('')
      setError(null)
      onSaved()
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить токен')
    },
  })

  // Удаление: бот-секретарь оставляет запись с пустыми secrets (env-fallback),
  // личный бот сотрудника удаляется целиком.
  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!state?.bot) throw new Error('Бот не выбран')
      if (state.bot.type === 'telegram_workspace_bot') {
        const { error: updErr } = await supabase
          .from('workspace_integrations')
          .update({
            secrets: {},
            config: {
              ...state.bot.config,
              bot_id: undefined,
              bot_username: undefined,
              bot_display_name: undefined,
            },
          })
          .eq('id', state.bot.id)
        if (updErr) throw updErr
      } else {
        const { error: delErr } = await supabase
          .from('workspace_integrations')
          .delete()
          .eq('id', state.bot.id)
        if (delErr) throw delErr
      }
    },
    onSuccess: () => {
      toast.success('Токен удалён')
      setToken('')
      setError(null)
      onSaved()
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Не удалось удалить токен')
    },
  })

  const open = state !== null
  const hasExisting = !!state?.bot

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setToken('')
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title ?? 'Токен Telegram-бота'}</DialogTitle>
          <DialogDescription>
            Вставьте токен, полученный у @BotFather. Перед сохранением мы проверим его через
            Telegram и покажем, какому боту он принадлежит.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Input
            type="password"
            placeholder="123456:ABC-DEF1234..."
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setError(null)
            }}
            autoFocus
            disabled={saveMutation.isPending}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {hasExisting && state?.bot?.has_token && (
            <p className="text-xs text-muted-foreground">
              Токен уже сохранён в БД. Введите новый, чтобы заменить, или удалите по кнопке ниже.
            </p>
          )}
        </div>
        <DialogFooter className="flex flex-row justify-between items-center sm:justify-between">
          <div>
            {hasExisting && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending || saveMutation.isPending}
              >
                Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>
              Отмена
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !token.trim()}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Проверка…
                </>
              ) : (
                'Сохранить'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
