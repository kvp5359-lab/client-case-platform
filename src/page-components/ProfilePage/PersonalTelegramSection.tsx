"use client"

/**
 * Секция «Личный Telegram» в профиле пользователя.
 *
 * Раньше подключить свой личный Telegram (Business / MTProto) можно было только
 * на странице «Настройки воркспейса → Интеграции», доступной владельцу/менеджеру.
 * Рядовой сотрудник туда не попадал и не мог подключиться сам — хотя подключение
 * по определению делает только сам владелец аккаунта.
 *
 * Здесь переиспользуем тот же PersonalTelegramSection в режиме selfOnly: он
 * показывает только строку текущего пользователя с кнопками подключения, без
 * списка всех сотрудников. Логика подключения (диалоги Business/MTProto) — общая
 * с админской страницей, не дублируется.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { STALE_TIME } from '@/hooks/queryKeys'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import { PersonalTelegramSection } from '@/page-components/workspace-settings/IntegrationsTab/PersonalTelegramSection'

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

  if (!workspaceId || !me) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Личный Telegram</h2>
        <p className="text-sm text-muted-foreground">
          Подключи свой личный Telegram, чтобы вести переписку с клиентами из сервиса.
          Подключение делаешь только ты сам — со своего аккаунта.
        </p>
      </div>
      <PersonalTelegramSection workspaceId={workspaceId} employees={[me]} selfOnly />
    </section>
  )
}
