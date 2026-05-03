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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageCircle, Mail, Sparkles, Loader2, User, Copy, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { useAuth } from '@/contexts/AuthContext'

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
    bot_avatar_url?: string
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
  user_id: string | null
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
    () =>
      integrations.filter(
        (i) =>
          i.type === 'telegram_workspace_bot' &&
          // v1-бот скрыт из UI: он остаётся в БД для обслуживания legacy-групп,
          // но новый секретарь у воркспейса один — v2.
          i.config.bot_version !== 'v1',
      ),
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
        .select('id, email, user_id, is_active, watch_expires_at')
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

  // Тихий backfill: для подключённых ботов, у которых нет bot_avatar_url,
  // дёргаем refresh_avatar один раз за сессию. После этого аватарки
  // появляются. Используем ref-set, чтобы не звать дважды для одной интеграции.
  const refreshedAvatarIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const needsAvatar = integrations.filter(
      (i) => i.has_token && !i.config.bot_avatar_url && !refreshedAvatarIdsRef.current.has(i.id),
    )
    if (needsAvatar.length === 0) return
    needsAvatar.forEach((i) => refreshedAvatarIdsRef.current.add(i.id))
    Promise.all(
      needsAvatar.map((i) =>
        supabase.functions
          .invoke('telegram-register-webhook', {
            body: { integration_id: i.id, action: 'refresh_avatar' },
          })
          .catch((err) => console.warn('[refresh_avatar] failed for', i.id, err)),
      ),
    ).then(() => refreshIntegrations())
  }, [integrations, refreshIntegrations])

  const sections: Array<{ id: SectionKey; label: string; icon: typeof MessageCircle }> = [
    { id: 'telegram', label: 'Telegram', icon: MessageCircle },
    { id: 'gmail', label: 'Gmail', icon: Mail },
    { id: 'business', label: 'Личный Telegram сотрудника', icon: Sparkles },
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
        {section === 'gmail' && (
          <GmailSection emailAccounts={emailAccounts} participants={participants} />
        )}
        {section === 'business' && (
          <PersonalTelegramSection
            workspaceId={workspaceId!}
            employees={employees}
          />
        )}
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
          workspaceBots.map((bot) => {
            const avatar = bot.config.bot_avatar_url
            return (
              <div
                key={bot.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatar}
                      alt=""
                      className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                      <MessageCircle className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                  <span className="font-medium text-sm truncate">
                    {bot.config.bot_display_name || 'Бот-секретарь'}
                  </span>
                  {bot.config.bot_username && (
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      @{bot.config.bot_username}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => onEdit(bot)}>
                  {bot.has_token ? 'Изменить' : 'Указать токен'}
                </Button>
              </div>
            )
          })
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
            const botAvatarUrl = bot?.config.bot_avatar_url
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {bot ? (
                    botAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={botAvatarUrl}
                        alt=""
                        className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full shrink-0 bg-cyan-50 dark:bg-cyan-950/30 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      </div>
                    )
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 bg-muted flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-medium text-sm truncate">{fullName}</span>
                  {bot ? (
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      @{bot.config.bot_username}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground truncate">
                      Личный бот не подключён
                    </span>
                  )}
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

function GmailSection({
  emailAccounts,
  participants,
}: {
  emailAccounts: EmailAccount[]
  participants: WorkspaceParticipant[]
}) {
  const participantByUserId = useMemo(() => {
    const map = new Map<string, WorkspaceParticipant>()
    participants.forEach((p) => {
      if (p.user_id) map.set(p.user_id, p)
    })
    return map
  }, [participants])

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
              Подключённые ящики сотрудников. Подключение — через карточку проекта в разделе
              «Почта».
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {emailAccounts.length > 0 ? `${emailAccounts.length} ящик(ов)` : 'Нет ящиков'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {emailAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ящики пока не подключены.</p>
        ) : (
          emailAccounts.map((acc) => {
            const owner = acc.user_id ? participantByUserId.get(acc.user_id) : undefined
            const ownerName = owner
              ? [owner.name, owner.last_name].filter(Boolean).join(' ') || owner.email
              : null
            const watchExpired =
              acc.watch_expires_at && new Date(acc.watch_expires_at) < new Date()
            return (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {owner?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={owner.avatar_url}
                      alt=""
                      className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full shrink-0 bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                      <Mail className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </div>
                  )}
                  <span className="font-medium text-sm truncate">
                    {ownerName ?? '—'}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {acc.email}
                  </span>
                  {!acc.is_active && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                      выкл
                    </Badge>
                  )}
                  {watchExpired && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                      watch истёк
                    </Badge>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

interface BusinessConnectionRow {
  id: string
  user_id: string
  tg_user_id: number
  tg_username: string | null
  tg_first_name: string | null
  is_enabled: boolean
  can_reply: boolean
}

interface UserTelegramLinkRow {
  user_id: string
  tg_user_id: number
  tg_username: string | null
  tg_first_name: string | null
}

function TelegramBusinessSection({
  workspaceId,
  employees,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
}) {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  // Подключения через @clientcase_bot. Видны: своё (всегда), все
  // сотрудников воркспейса (если у текущего юзера manage_workspace_settings).
  const { data: connections = [] } = useQuery({
    queryKey: ['integrations', 'business-connections', workspaceId],
    queryFn: async (): Promise<BusinessConnectionRow[]> => {
      // Таблица свежая, типы Supabase ещё не регенерированы — каст через any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any
      const { data, error } = await client
        .from('telegram_business_connections')
        .select('id, user_id, tg_user_id, tg_username, tg_first_name, is_enabled, can_reply')
        .eq('workspace_id', workspaceId)
      if (error) throw error
      return (data ?? []) as BusinessConnectionRow[]
    },
    enabled: !!workspaceId,
  })

  // Привязки tg_user_id для отображения @username даже если business
  // ещё не подключён (после шага 1, до шага 2).
  const employeeUserIds = useMemo(
    () => employees.map((e) => e.user_id).filter((v): v is string => !!v),
    [employees],
  )
  const { data: tgLinks = [] } = useQuery({
    queryKey: ['integrations', 'tg-links', workspaceId, employeeUserIds.join(',')],
    queryFn: async (): Promise<UserTelegramLinkRow[]> => {
      if (employeeUserIds.length === 0) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any
      const { data, error } = await client
        .from('user_telegram_links')
        .select('user_id, tg_user_id, tg_username, tg_first_name')
        .in('user_id', employeeUserIds)
      if (error) throw error
      return (data ?? []) as UserTelegramLinkRow[]
    },
    enabled: !!workspaceId && employeeUserIds.length > 0,
  })

  const connectionByUserId = useMemo(() => {
    const map = new Map<string, BusinessConnectionRow>()
    connections.forEach((c) => map.set(c.user_id, c))
    return map
  }, [connections])

  const linkByUserId = useMemo(() => {
    const map = new Map<string, UserTelegramLinkRow>()
    tgLinks.forEach((l) => map.set(l.user_id, l))
    return map
  }, [tgLinks])

  const activeCount = connections.filter((c) => c.is_enabled).length

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram Business</CardTitle>
              <CardDescription className="mt-0.5">
                Личные диалоги сотрудников через Telegram Business. Сообщения клиентов
                синхронизируются в системный проект «Личные диалоги Telegram», ответы
                уходят от имени сотрудника. Требуется Telegram Premium.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {activeCount > 0 ? `Активно: ${activeCount}` : 'Никто не подключён'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет сотрудников в воркспейсе.</p>
          ) : (
            employees.map((emp) => {
              if (!emp.user_id) return null
              const fullName =
                [emp.name, emp.last_name].filter(Boolean).join(' ') || emp.email || '—'
              const conn = connectionByUserId.get(emp.user_id)
              const link = linkByUserId.get(emp.user_id)
              const isMe = emp.user_id === currentUserId
              const tgUsername = conn?.tg_username ?? link?.tg_username ?? null

              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {emp.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={emp.avatar_url}
                        alt=""
                        className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full shrink-0 bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                    )}
                    <span className="font-medium text-sm truncate">{fullName}</span>
                    {tgUsername && (
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        @{tgUsername}
                      </span>
                    )}
                    {conn?.is_enabled && conn.can_reply && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 shrink-0 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                      >
                        активен
                      </Badge>
                    )}
                    {conn?.is_enabled && !conn.can_reply && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        только чтение
                      </Badge>
                    )}
                    {conn && !conn.is_enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        выкл
                      </Badge>
                    )}
                    {!conn && link && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        ждёт подключения в Telegram
                      </Badge>
                    )}
                    {!conn && !link && (
                      <span className="text-xs text-muted-foreground shrink-0">не подключено</span>
                    )}
                  </div>
                  {isMe && !conn && (
                    <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
                      Подключить
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <BusinessLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        workspaceId={workspaceId}
      />
    </>
  )
}

function BusinessLinkDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
}) {
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Генерируем токен при открытии диалога.
  useEffect(() => {
    if (!open) {
      setDeepLink(null)
      setBotUsername(null)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase.functions
      .invoke('telegram-business-link-init', { body: { workspace_id: workspaceId } })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          toast.error('Не удалось создать ссылку: ' + error.message)
          onOpenChange(false)
          return
        }
        const d = data as { deep_link?: string; bot_username?: string } | null
        if (d?.deep_link) {
          setDeepLink(d.deep_link)
          setBotUsername(d.bot_username ?? null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, workspaceId, onOpenChange])

  const copyLink = async () => {
    if (!deepLink) return
    try {
      await navigator.clipboard.writeText(deepLink)
      toast.success('Скопировано')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключение Telegram Business</DialogTitle>
          <DialogDescription>
            Двухшаговое подключение: сначала привязываем твой Telegram-аккаунт, потом
            ты добавляешь бота как делегата в настройках Telegram.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <h4 className="text-sm font-medium mb-1">Шаг 1. Привязать Telegram-аккаунт</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Открой ссылку ниже и нажми «START» в чате с ботом. Бот запомнит твой
              Telegram-аккаунт и привяжет его к твоему профилю в сервисе.
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Создаём ссылку...
              </div>
            ) : deepLink ? (
              <div className="flex items-center gap-2">
                <Input value={deepLink} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={copyLink} title="Скопировать">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" asChild title="Открыть">
                  <a href={deepLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground mt-1">
              Ссылка действительна 30 минут.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Шаг 2. Добавить бота в Telegram Business</h4>
            <p className="text-xs text-muted-foreground">
              В Telegram открой:{' '}
              <span className="font-medium">Settings → Telegram Business → Chatbots</span>.
              {botUsername ? (
                <>
                  {' '}
                  Введи <span className="font-mono">@{botUsername}</span> и включи право{' '}
                  <span className="font-medium">Reply to messages</span>, чтобы можно было
                  отвечать клиентам из сервиса от твоего имени.
                </>
              ) : null}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Telegram Business доступен только при активной подписке Telegram Premium.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

      let integrationId: string | null = null
      let integrationType: BotIntegration['type'] | null = null

      if (state.bot) {
        const { error: updErr } = await supabase
          .from('workspace_integrations')
          .update({ secrets: { token: trimmed }, config: newConfig })
          .eq('id', state.bot.id)
        if (updErr) throw updErr
        integrationId = state.bot.id
        integrationType = state.bot.type
      } else if (state.createParams) {
        const { data: ins, error: insErr } = await supabase
          .from('workspace_integrations')
          .insert({
            workspace_id: state.createParams.workspace_id,
            type: state.createParams.type,
            config: newConfig,
            secrets: { token: trimmed },
            is_active: true,
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        integrationId = ins?.id ?? null
        integrationType = state.createParams.type
      } else {
        throw new Error('Невозможный сценарий: ни bot, ни createParams не заданы')
      }

      // Для личного бота — серверная регистрация webhook'а через
      // edge-функцию. Edge-функция читает токен из БД и зовёт Telegram API.
      // Это надёжнее, чем вызов напрямую из браузера: даже если у юзера
      // отвалится интернет в момент сохранения, edge-функция отработает.
      if (integrationType === 'telegram_employee_bot' && integrationId) {
        const { data: regData, error: regErr } = await supabase.functions.invoke(
          'telegram-register-webhook',
          { body: { integration_id: integrationId, action: 'register' } },
        )
        if (regErr || (regData as { ok?: boolean })?.ok === false) {
          console.warn('[register-webhook] failed:', regErr ?? regData)
          toast.warning(
            'Токен сохранён, но webhook не зарегистрировался. Реплаи в Telegram могут не связываться с исходниками. Попробуй ещё раз — нажми «Изменить» и сохрани тот же токен.',
          )
        }
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
        // Сначала отзываем webhook у Telegram (пока токен ещё в БД и
        // edge-функция может его прочитать). Если запрос упал —
        // продолжаем удаление, webhook останется висеть, но он будет
        // отбиваться 401 на нашей стороне (его secret_token больше не
        // совпадёт ни с одной активной интеграцией).
        try {
          await supabase.functions.invoke('telegram-register-webhook', {
            body: { integration_id: state.bot.id, action: 'remove' },
          })
        } catch (err) {
          console.warn('[delete-webhook] failed, continuing with row delete:', err)
        }
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

// =============================================================================
// PersonalTelegramSection — общая вкладка для двух способов привязать
// личный Telegram сотрудника:
//  - MTProto (любой Telegram-аккаунт, без Premium) — phone + код, опц. 2FA
//  - Business (требует Telegram Premium) — бот-делегат через настройки TG
// =============================================================================

function PersonalTelegramSection({
  workspaceId,
  employees,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
}) {
  return (
    <Tabs defaultValue="mtproto" className="space-y-4">
      <TabsList>
        <TabsTrigger value="mtproto">MTProto (любой аккаунт)</TabsTrigger>
        <TabsTrigger value="business">Telegram Business (Premium)</TabsTrigger>
      </TabsList>
      <TabsContent value="mtproto" className="mt-2">
        <TelegramMTProtoSection workspaceId={workspaceId} employees={employees} />
      </TabsContent>
      <TabsContent value="business" className="mt-2">
        <TelegramBusinessSection workspaceId={workspaceId} employees={employees} />
      </TabsContent>
    </Tabs>
  )
}

interface MTProtoSessionRow {
  user_id: string
  tg_user_id: number | null
  tg_username: string | null
  tg_first_name: string | null
  tg_last_name: string | null
  is_active: boolean
}

function TelegramMTProtoSection({
  workspaceId,
  employees,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
}) {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const queryClient = useQueryClient()
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)

  const { data: sessions = [] } = useQuery({
    queryKey: ['integrations', 'mtproto-sessions', workspaceId],
    queryFn: async (): Promise<MTProtoSessionRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any
      const { data, error } = await client
        .from('telegram_mtproto_sessions')
        .select('user_id, tg_user_id, tg_username, tg_first_name, tg_last_name, is_active')
        .eq('workspace_id', workspaceId)
      if (error) throw error
      return (data ?? []) as MTProtoSessionRow[]
    },
    enabled: !!workspaceId,
  })

  const sessionByUserId = useMemo(() => {
    const map = new Map<string, MTProtoSessionRow>()
    sessions.forEach((s) => map.set(s.user_id, s))
    return map
  }, [sessions])

  const activeCount = sessions.filter((s) => s.is_active).length

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'disconnect' },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Отключено')
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'mtproto-sessions', workspaceId],
      })
    },
    onError: (err) => {
      toast.error('Не удалось отключить: ' + (err as Error).message)
    },
  })

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram MTProto</CardTitle>
              <CardDescription className="mt-0.5">
                Подключение личного Telegram-аккаунта по номеру телефона. Сообщения и
                реакции синхронизируются в обе стороны от имени сотрудника. Premium не
                требуется.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {activeCount > 0 ? `Активно: ${activeCount}` : 'Никто не подключён'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет сотрудников в воркспейсе.</p>
          ) : (
            employees.map((emp) => {
              if (!emp.user_id) return null
              const fullName =
                [emp.name, emp.last_name].filter(Boolean).join(' ') || emp.email || '—'
              const session = sessionByUserId.get(emp.user_id)
              const isMe = emp.user_id === currentUserId
              const tgName = session
                ? [session.tg_first_name, session.tg_last_name].filter(Boolean).join(' ') ||
                  session.tg_username ||
                  null
                : null

              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {emp.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={emp.avatar_url}
                        alt=""
                        className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full shrink-0 bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                    <span className="font-medium text-sm truncate">{fullName}</span>
                    {tgName && (
                      <span className="text-xs text-muted-foreground truncate">
                        — {tgName}
                      </span>
                    )}
                    {session?.is_active && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 shrink-0 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                      >
                        активна
                      </Badge>
                    )}
                    {session && !session.is_active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        отключена
                      </Badge>
                    )}
                    {!session && (
                      <span className="text-xs text-muted-foreground shrink-0">не подключено</span>
                    )}
                  </div>
                  {isMe && !session?.is_active && (
                    <Button size="sm" variant="outline" onClick={() => setConnectDialogOpen(true)}>
                      Подключить
                    </Button>
                  )}
                  {isMe && session?.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                    >
                      Отключить
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <MTProtoConnectDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        workspaceId={workspaceId}
        onConnected={() =>
          queryClient.invalidateQueries({
            queryKey: ['integrations', 'mtproto-sessions', workspaceId],
          })
        }
      />
    </>
  )
}

type MTProtoStep = 'phone' | 'code' | 'password' | 'done'

function MTProtoConnectDialog({
  open,
  onOpenChange,
  workspaceId,
  onConnected,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  onConnected: () => void
}) {
  const [step, setStep] = useState<MTProtoStep>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setStep('phone')
      setPhone('')
      setCode('')
      setPassword('')
      setBusy(false)
    }
  }, [open])

  const sendCode = async () => {
    if (!phone.trim()) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'send-code', workspace_id: workspaceId, phone: phone.trim() },
      })
      if (error || (data as { error?: string })?.error) {
        throw new Error(error?.message || (data as { error?: string }).error || 'Ошибка')
      }
      setStep('code')
      toast.success('Код отправлен в Telegram')
    } catch (err) {
      toast.error('Не удалось отправить код: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    if (!code.trim()) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'verify-code', code: code.trim() },
      })
      if (error) throw error
      const result = data as { ok?: boolean; needs_password?: boolean; error?: string }
      if (result?.error) throw new Error(result.error)
      if (result?.needs_password) {
        setStep('password')
        toast.info('Введите пароль 2FA')
      } else {
        setStep('done')
        toast.success('Telegram подключён')
        onConnected()
        setTimeout(() => onOpenChange(false), 800)
      }
    } catch (err) {
      toast.error('Ошибка: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const verifyPassword = async () => {
    if (!password) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'verify-password', password },
      })
      if (error) throw error
      const result = data as { ok?: boolean; error?: string }
      if (result?.error) throw new Error(result.error)
      setStep('done')
      toast.success('Telegram подключён')
      onConnected()
      setTimeout(() => onOpenChange(false), 800)
    } catch (err) {
      toast.error('Неверный пароль: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключение Telegram</DialogTitle>
          <DialogDescription>
            Подключаем твой личный Telegram через MTProto. Сообщения и реакции пойдут от
            твоего имени, без бота-посредника.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {step === 'phone' && (
            <>
              <label className="text-sm font-medium">Номер телефона</label>
              <Input
                placeholder="+34643268407"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) sendCode()
                }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                В международном формате с «+». Telegram пришлёт код подтверждения сервисным
                сообщением от @Telegram.
              </p>
            </>
          )}
          {step === 'code' && (
            <>
              <label className="text-sm font-medium">Код из Telegram</label>
              <Input
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) verifyCode()
                }}
                autoFocus
                inputMode="numeric"
              />
              <p className="text-[11px] text-muted-foreground">
                Открой Telegram, найди чат «Telegram» и введи код оттуда.
              </p>
            </>
          )}
          {step === 'password' && (
            <>
              <label className="text-sm font-medium">Пароль 2FA</label>
              <Input
                type="password"
                placeholder="Пароль облачного хранилища"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) verifyPassword()
                }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                У этого аккаунта включена двухфакторная авторизация. Введи пароль, который
                ты ставил в Telegram.
              </p>
            </>
          )}
          {step === 'done' && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              ✓ Подключено. Сообщения начнут синхронизироваться сразу.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          {step === 'phone' && (
            <Button onClick={sendCode} disabled={busy || !phone.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Отправить код
            </Button>
          )}
          {step === 'code' && (
            <Button onClick={verifyCode} disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Подтвердить
            </Button>
          )}
          {step === 'password' && (
            <Button onClick={verifyPassword} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Войти
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
