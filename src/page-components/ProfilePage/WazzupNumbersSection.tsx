"use client"

/**
 * Строка «WhatsApp / Instagram (Wazzup)» в аккордеоне профиля — ТОЛЬКО просмотр.
 *
 * В отличие от Telegram/Gmail, Wazzup-номера — рабочий ресурс воркспейса
 * (покупаются в кабинете Wazzup, назначает сотруднику владелец/менеджер). Своего
 * действия «подключить» у сотрудника нет — поэтому без кнопок, просто список
 * назначенных номеров. RLS wazzup_channels SELECT пускает сотрудника к своим
 * строкам. Строка не рендерится, если номеров нет.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME, wazzupKeys } from '@/hooks/queryKeys'
import { WhatsAppIcon } from '@/components/messenger/brandIcons'
import { cn } from '@/lib/utils'
import { IntegrationRow } from './IntegrationRow'

type MyWazzupChannel = {
  id: string
  phone: string | null
  transport: string | null
  name: string | null
  state: string | null
}

function formatPhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return '+' + digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, '$1 ')
}

export function WazzupNumbersSection({ workspaceId }: { workspaceId: string | null | undefined }) {
  const { user } = useAuth()

  const { data: channels = [] } = useQuery({
    queryKey: wazzupKeys.myChannels(workspaceId ?? '', user?.id ?? ''),
    queryFn: async (): Promise<MyWazzupChannel[]> => {
      const { data, error } = await supabase
        .from('wazzup_channels')
        .select('id, phone, transport, name, state')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user!.id)
        .order('phone', { ascending: true })
      if (error) throw error
      return (data ?? []) as MyWazzupChannel[]
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.STANDARD,
  })

  if (channels.length === 0) return null

  return (
    <IntegrationRow
      icon={<WhatsAppIcon className="h-5 w-5 text-emerald-600" />}
      title="WhatsApp / Instagram"
      statusLabel={channels.length === 1 ? '1 номер' : `${channels.length} номера`}
      tone="ok"
    >
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Номера назначает администратор — здесь только для информации.
        </p>
        <div className="rounded-md border divide-y">
          {channels.map((ch) => {
            const isInstagram = ch.transport === 'instagram'
            const isBlocked = ch.state === 'blocked'
            const label = isInstagram
              ? ch.name || 'Instagram'
              : formatPhone(ch.phone) || ch.name || 'WhatsApp'
            return (
              <div key={ch.id} className="flex items-center gap-2 px-3 py-2">
                <WhatsAppIcon
                  className={cn('h-4 w-4 shrink-0', isInstagram ? 'text-pink-500' : 'text-emerald-600')}
                />
                <span className="text-sm font-medium truncate">{label}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  {isInstagram ? 'Instagram' : 'WhatsApp'}
                </span>
                <span
                  className={cn(
                    'ml-auto text-xs px-1.5 py-0.5 rounded shrink-0',
                    isBlocked
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                  )}
                >
                  {isBlocked ? 'неактивен' : 'активен'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </IntegrationRow>
  )
}
