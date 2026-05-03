"use client"

/**
 * WazzupSection — секция в IntegrationsTab для настройки Wazzup.
 *
 * Шаги для пользователя (видны на странице):
 *   1. Зарегистрироваться на wazzup24.com, оплатить тариф, подключить номер.
 *   2. Скопировать API-ключ из кабинета Wazzup и вставить сюда.
 *   3. Скопировать наш webhook URL и вставить в кабинете Wazzup
 *      (Настройки → Webhooks; подписки: messagesAndStatuses, channelsUpdates).
 *   4. Нажать «Загрузить каналы» — мы вытянем номера через REST.
 *   5. Назначить каждый канал на сотрудника.
 */

import { useState, useMemo } from 'react'
import { Copy, RefreshCcw, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useWazzupSettings,
  useUpsertWazzupSettings,
  useWazzupChannels,
  useFetchWazzupChannels,
  useSetWazzupWebhook,
  useAssignWazzupChannelUser,
  buildWazzupWebhookUrl,
  type WazzupChannel,
} from '@/hooks/useWazzup'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'

interface Props {
  workspaceId: string
  /** Сотрудники воркспейса (с user_id) для назначения на каналы. */
  employees: WorkspaceParticipant[]
}

export function WazzupSection({ workspaceId, employees }: Props) {
  const { data: settings, isLoading: loadingSettings } = useWazzupSettings(workspaceId)
  const upsertSettings = useUpsertWazzupSettings(workspaceId)
  const { data: channels = [], isLoading: loadingChannels } = useWazzupChannels(workspaceId)
  const fetchChannels = useFetchWazzupChannels(workspaceId)
  const setWebhook = useSetWazzupWebhook(workspaceId)
  const assignUser = useAssignWazzupChannelUser(workspaceId)

  const [apiKeyDraft, setApiKeyDraft] = useState('')

  const webhookUrl = useMemo(
    () => (settings ? buildWazzupWebhookUrl(settings.webhook_secret) : ''),
    [settings],
  )

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} скопирован`),
      () => toast.error('Не удалось скопировать'),
    )
  }

  const employeesByUserId = useMemo(() => {
    const map = new Map<string, WorkspaceParticipant>()
    for (const p of employees) if (p.user_id) map.set(p.user_id, p)
    return map
  }, [employees])

  return (
    <div className="space-y-4">
      {/* Шаг 1: API-ключ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Шаг 1. API-ключ Wazzup</CardTitle>
          <CardDescription>
            Зарегистрируйся на{' '}
            <a
              href="https://wazzup24.com"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              wazzup24.com <ExternalLink className="h-3 w-3" />
            </a>
            , подключи WhatsApp-номер и скопируй API-ключ из кабинета (Настройки → API).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSettings ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : settings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Ключ сохранён (****{settings.api_key.slice(-4)})
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Ключ ещё не сохранён
            </div>
          )}

          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={settings ? 'Введи новый ключ, чтобы заменить' : 'API-ключ из кабинета Wazzup'}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => {
                if (!apiKeyDraft.trim()) return
                upsertSettings.mutate(apiKeyDraft.trim(), {
                  onSuccess: () => setApiKeyDraft(''),
                })
              }}
              disabled={!apiKeyDraft.trim() || upsertSettings.isPending}
            >
              {upsertSettings.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {settings ? 'Заменить' : 'Сохранить'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Шаг 2: Webhook (через API Wazzup, не через UI кабинета) */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Шаг 2. Подписать webhook</CardTitle>
            <CardDescription>
              Wazzup не позволяет настроить webhook через UI кабинета — только через API.
              Нажми кнопку, и мы автоматически подпишем твой аккаунт Wazzup на наши события
              (входящие сообщения, статусы доставки, обновления каналов).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="flex-1 font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(webhookUrl, 'Webhook URL')}
                title="Скопировать URL"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={() => setWebhook.mutate()}
              disabled={setWebhook.isPending}
            >
              {setWebhook.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Подписать webhook
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Шаг 3: Каналы */}
      {settings && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Шаг 3. Каналы (номера)</CardTitle>
              <CardDescription>
                Загрузи список каналов из Wazzup и привяжи каждый к сотруднику. Сообщения с
                непривязанных каналов не будут попадать в сервис.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchChannels.mutate()}
              disabled={fetchChannels.isPending}
            >
              {fetchChannels.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-2" />
              )}
              Загрузить из Wazzup
            </Button>
          </CardHeader>
          <CardContent>
            {loadingChannels ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Каналы ещё не загружены. Нажми «Загрузить из Wazzup».
              </p>
            ) : (
              <div className="divide-y">
                {channels.map((ch) => (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    employees={employees}
                    employeesByUserId={employeesByUserId}
                    onAssign={(userId) =>
                      assignUser.mutate({ channelDbId: ch.id, userId })
                    }
                    isAssigning={assignUser.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface RowProps {
  channel: WazzupChannel
  employees: WorkspaceParticipant[]
  employeesByUserId: Map<string, WorkspaceParticipant>
  onAssign: (userId: string | null) => void
  isAssigning: boolean
}

function ChannelRow({ channel, employees, employeesByUserId, onAssign, isAssigning }: RowProps) {
  const assigned = channel.user_id ? employeesByUserId.get(channel.user_id) : null
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{channel.name || channel.phone || channel.channel_id}</span>
          <Badge variant="outline" className="text-xs">
            {channel.transport}
          </Badge>
          {channel.state && (
            <Badge
              variant={channel.state === 'active' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {channel.state}
            </Badge>
          )}
        </div>
        {channel.phone && channel.phone !== channel.name && (
          <p className="text-xs text-muted-foreground mt-0.5">{channel.phone}</p>
        )}
      </div>

      <Select
        value={channel.user_id ?? '__none__'}
        onValueChange={(v) => onAssign(v === '__none__' ? null : v)}
        disabled={isAssigning}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Не назначен">
            {assigned
              ? `${assigned.name} ${assigned.last_name ?? ''}`.trim()
              : 'Не назначен'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Не назначен —</SelectItem>
          {employees
            .filter((e) => e.user_id)
            .map((e) => (
              <SelectItem key={e.user_id!} value={e.user_id!}>
                {`${e.name} ${e.last_name ?? ''}`.trim()}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  )
}
