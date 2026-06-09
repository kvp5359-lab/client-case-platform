"use client"

/**
 * Секция «WhatsApp / Instagram (Wazzup)» в профиле — ТОЛЬКО просмотр.
 *
 * В отличие от Telegram/Gmail, Wazzup-номера — это рабочий ресурс воркспейса
 * (покупаются в кабинете Wazzup, один API-ключ на всех), а назначает их
 * сотруднику владелец/менеджер в админских настройках. У сотрудника нет своего
 * действия «подключить» — поэтому здесь без кнопок, просто список назначенных
 * ему номеров, чтобы он знал, через что ведёт переписку.
 *
 * RLS wazzup_channels SELECT пускает сотрудника к строкам с его user_id.
 * Секция не рендерится, если номеров нет.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME } from '@/hooks/queryKeys'
import { WhatsAppIcon } from '@/components/messenger/brandIcons'
import { cn } from '@/lib/utils'

type MyWazzupChannel = {
  id: string
  phone: string | null
  transport: string | null
  name: string | null
  state: string | null
}

/** E.164-без-плюса → «+34 617 787 730» (читабельные группы). */
function formatPhone(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return '+' + digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, '$1 ')
}

export function WazzupNumbersSection({ workspaceId }: { workspaceId: string | null | undefined }) {
  const { user } = useAuth()

  const { data: channels = [] } = useQuery({
    queryKey: ['wazzup', 'my-channels', workspaceId ?? '', user?.id ?? ''],
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
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">WhatsApp / Instagram (Wazzup)</h2>
        <p className="text-sm text-muted-foreground">
          Номера, через которые ты ведёшь переписку с клиентами. Назначает их администратор —
          здесь только для информации.
        </p>
      </div>
      <div className="rounded-lg border divide-y">
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
    </section>
  )
}
