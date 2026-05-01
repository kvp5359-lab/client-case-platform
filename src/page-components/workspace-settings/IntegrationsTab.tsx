"use client"

/**
 * IntegrationsTab — единая страница интеграций воркспейса.
 *
 * Сейчас — read-only витрина: существующие Telegram (групповой бот) и Gmail
 * (OAuth ящики) показываются здесь, чтобы владелец юрфирмы видел в одном
 * месте, что подключено. Реальная конфигурация и переезд на
 * `workspace_integrations` (per-workspace бот через secret_token, Telegram
 * Business) — отдельные шаги CRM-фрейма.
 */

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Mail, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'

export function IntegrationsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  // Подключённые группы Telegram (через бот)
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

  // Подключённые Gmail-ящики
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
      {/* Telegram — групповой бот */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram (групповой бот)</CardTitle>
              <CardDescription className="mt-0.5">
                Бот, который добавляется в групповые чаты с клиентами и связывает их с проектами.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            Подключён
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Подключено групп: <span className="font-medium text-foreground">{telegramGroups}</span>
          <div className="mt-1 text-xs">
            Сейчас бот настраивается на уровне сервиса. Per-workspace бот с собственным именем —
            в плане CRM-фрейма.
          </div>
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
    </div>
  )
}
