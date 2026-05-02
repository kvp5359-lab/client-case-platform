"use client"

/**
 * IntegrationsTab — единая страница интеграций воркспейса.
 *
 * Сейчас реализовано:
 * - Telegram-бот воркспейса (workspace_integrations type=telegram_workspace_bot):
 *   карточка показывает статус каждого бота + кнопка ввода токена. Если токен
 *   заполнен, edge-функции (resolveBotToken) берут его из БД; иначе — фоллбэк
 *   на env-переменные TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKEN_V2 (так работало
 *   до миграции).
 * - Gmail (read-only витрина).
 * - Telegram Business (заглушка).
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageCircle, Mail, Sparkles, Loader2 } from 'lucide-react'
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

interface WorkspaceBot {
  id: string
  is_active: boolean
  config: {
    bot_version?: string
    note?: string
    bot_username?: string
    bot_display_name?: string
    bot_id?: number
  }
  has_token: boolean
}

export function IntegrationsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const [editingBot, setEditingBot] = useState<WorkspaceBot | null>(null)

  // Telegram-боты воркспейса
  const { data: workspaceBots = [] } = useQuery({
    queryKey: ['integrations', 'telegram-workspace-bots', workspaceId],
    queryFn: async (): Promise<WorkspaceBot[]> => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('workspace_integrations')
        .select('id, is_active, config, secrets')
        .eq('workspace_id', workspaceId)
        .eq('type', 'telegram_workspace_bot')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        is_active: row.is_active,
        config: (row.config as WorkspaceBot['config']) ?? {},
        has_token: !!(row.secrets as { token?: string } | null)?.token,
      }))
    },
    enabled: !!workspaceId,
  })

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

  // Gmail
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
      return data ?? []
    },
    enabled: !!workspaceId,
  })

  return (
    <div className="space-y-4">
      {/* Telegram — групповые боты воркспейса */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram (групповой бот)</CardTitle>
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
                <Button size="sm" variant="outline" onClick={() => setEditingBot(bot)}>
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
            (команда «/newbot»). Скопируйте строку вида{' '}
            <span className="font-mono">123456:ABC-DEF...</span> и вставьте по кнопке выше.
          </p>
        </CardContent>
      </Card>

      {/* Gmail */}
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

      {/* Telegram Business — заглушка */}
      <Card className="opacity-70">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram Business</CardTitle>
              <CardDescription className="mt-0.5">
                Личные аккаунты менеджеров с Telegram Premium — подключение бота-ассистента к
                их личной переписке с клиентами.
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            Скоро
          </Badge>
        </CardHeader>
      </Card>

      <BotTokenDialog
        bot={editingBot}
        onClose={() => setEditingBot(null)}
        onSaved={() =>
          queryClient.invalidateQueries({
            queryKey: ['integrations', 'telegram-workspace-bots', workspaceId],
          })
        }
      />
    </div>
  )
}

interface BotTokenDialogProps {
  bot: WorkspaceBot | null
  onClose: () => void
  onSaved: () => void
}

interface TelegramGetMe {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

function BotTokenDialog({ bot, onClose, onSaved }: BotTokenDialogProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!bot) throw new Error('Бот не выбран')
      const trimmed = token.trim()
      if (!trimmed) throw new Error('Введите токен')

      // Сначала проверяем токен через Telegram getMe (это проверка живости).
      let me: TelegramGetMe
      try {
        const res = await fetch(`https://api.telegram.org/bot${trimmed}/getMe`)
        const json = (await res.json()) as { ok: boolean; result?: TelegramGetMe; description?: string }
        if (!json.ok || !json.result) {
          throw new Error(json.description || 'Telegram отверг токен')
        }
        me = json.result
      } catch (err) {
        throw new Error(
          err instanceof Error ? `Не удалось проверить токен: ${err.message}` : 'Не удалось проверить токен',
        )
      }

      // Сохраняем токен и метаданные бота в БД.
      const { error: updErr } = await supabase
        .from('workspace_integrations')
        .update({
          secrets: { token: trimmed },
          config: {
            ...bot.config,
            bot_id: me.id,
            bot_username: me.username,
            bot_display_name: me.first_name,
          },
        })
        .eq('id', bot.id)
      if (updErr) throw updErr
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

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!bot) throw new Error('Бот не выбран')
      const { error: updErr } = await supabase
        .from('workspace_integrations')
        .update({
          secrets: {},
          config: {
            ...bot.config,
            bot_id: undefined,
            bot_username: undefined,
            bot_display_name: undefined,
          },
        })
        .eq('id', bot.id)
      if (updErr) throw updErr
    },
    onSuccess: () => {
      toast.success('Токен удалён, бот переключён на env-fallback')
      onSaved()
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Не удалось удалить токен')
    },
  })

  const open = !!bot

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
          <DialogTitle>Токен Telegram-бота</DialogTitle>
          <DialogDescription>
            Вставьте токен, полученный у @BotFather. Мы проверим его через Telegram перед
            сохранением и покажем имя бота для подтверждения.
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
          {bot?.has_token && (
            <p className="text-xs text-muted-foreground">
              Сейчас токен уже сохранён в БД. Введите новый, чтобы заменить, или удалите —
              кнопка ниже.
            </p>
          )}
        </div>
        <DialogFooter className="flex flex-row justify-between items-center sm:justify-between">
          <div>
            {bot?.has_token && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending || saveMutation.isPending}
              >
                Удалить токен
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>
              Отмена
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !token.trim()}>
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
