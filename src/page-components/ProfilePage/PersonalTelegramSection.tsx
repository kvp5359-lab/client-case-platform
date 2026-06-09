"use client"

/**
 * Строка «Личный Telegram» в аккордеоне профиля.
 *
 * Раньше подключить свой личный Telegram (Business / MTProto) можно было только
 * в админских настройках воркспейса, недоступных сотруднику. Здесь переиспользуем
 * тот же PersonalTelegramSection в режиме selfOnly — сотрудник подключает свой
 * аккаунт сам.
 */

import { useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME } from '@/hooks/queryKeys'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import { PersonalTelegramSection } from '@/page-components/workspace-settings/IntegrationsTab/PersonalTelegramSection'
import { IntegrationRow } from './IntegrationRow'

export function ProfilePersonalTelegramSection({
  workspaceId,
}: {
  workspaceId: string | null | undefined
}) {
  const { user } = useAuth()

  // Свой participant в текущем воркспейсе — RLS пускает к собственной строке.
  const { data: me } = useQuery({
    queryKey: ['participant', 'self', workspaceId ?? '', user?.id ?? ''],
    queryFn: async (): Promise<WorkspaceParticipant | null> => {
      const { data, error } = await supabase
        .from('participants')
        .select('id, name, last_name, email, avatar_url, user_id, workspace_roles, can_login')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user!.id)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      return (data as WorkspaceParticipant | null) ?? null
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.STANDARD,
  })

  // Статус для свёрнутой строки: подключён ли личный TG (MTProto или Business).
  const { data: connected = false } = useQuery({
    queryKey: ['profile', 'tg-status', workspaceId ?? '', user?.id ?? ''],
    queryFn: async (): Promise<boolean> => {
      const [mt, biz] = await Promise.all([
        supabase
          .from('telegram_mtproto_sessions')
          .select('user_id')
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user!.id)
          .eq('is_active', true)
          .limit(1),
        supabase
          .from('telegram_business_connections')
          .select('id')
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user!.id)
          .eq('is_enabled', true)
          .limit(1),
      ])
      return (mt.data?.length ?? 0) > 0 || (biz.data?.length ?? 0) > 0
    },
    enabled: !!workspaceId && !!user?.id,
    staleTime: STALE_TIME.STANDARD,
  })

  if (!workspaceId || !me) return null

  return (
    <IntegrationRow
      icon={<Send className="h-5 w-5 text-[#2AABEE]" />}
      title="Личный Telegram"
      statusLabel={connected ? 'Подключено' : 'Не подключено'}
      tone={connected ? 'ok' : 'off'}
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Подключи свой личный Telegram, чтобы вести переписку с клиентами из сервиса. Подключение
          делаешь только ты сам — со своего аккаунта.
        </p>
        <PersonalTelegramSection workspaceId={workspaceId} employees={[me]} selfOnly />
      </div>
    </IntegrationRow>
  )
}
