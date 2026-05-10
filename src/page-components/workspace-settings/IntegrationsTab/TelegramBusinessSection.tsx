"use client"

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, ExternalLink, Loader2, Sparkles, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { integrationsKeys } from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'

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

export function TelegramBusinessSection({
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
    queryKey: integrationsKeys.businessConnections(workspaceId),
    queryFn: async (): Promise<BusinessConnectionRow[]> => {
      const { data, error } = await supabase
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
    queryKey: integrationsKeys.tgLinks(workspaceId, employeeUserIds.join(',')),
    queryFn: async (): Promise<UserTelegramLinkRow[]> => {
      if (employeeUserIds.length === 0) return []
      const { data, error } = await supabase
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
                  {isMe && (
                    <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
                      {!link ? 'Подключить' : conn?.is_enabled ? 'Переподключить' : 'Активировать'}
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

export function BusinessLinkDialog({
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

  // Генерируем токен при открытии диалога. Сетстейты внутри — стандартный
  // fetch-on-mount паттерн, новый react-hooks lint-rule на это ругается, но
  // переписывать ради него не имеет смысла — нет «каскадных рендеров»,
  // setLoading сразу следует за reset'ом и fetch'ем.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
