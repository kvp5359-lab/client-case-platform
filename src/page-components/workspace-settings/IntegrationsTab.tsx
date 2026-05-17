"use client"

/**
 * IntegrationsTab — единая страница интеграций воркспейса.
 *
 * Левый сайд-навигатор (Telegram / Gmail / Личный TG / Wazzup / Email)
 * разделяет содержимое на под-разделы, чтобы страница не превращалась в
 * простыню. Каждый под-раздел живёт в своём файле в `./IntegrationsTab/`.
 *
 * Telegram-раздел содержит:
 * - Боты-секретари (workspace_integrations type=telegram_workspace_bot)
 * - Личные боты сотрудников (type=telegram_employee_bot)
 *
 * Gmail — read-only список подключённых ящиков.
 * Личный Telegram — MTProto (любой акк) + Business (Premium).
 * Wazzup — WhatsApp/Instagram через шлюз.
 * Email (Resend) — настройки исходящих/входящих через Resend.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar as CalendarIcon, Mail, MessageCircle, MessageSquare, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { integrationsKeys } from '@/hooks/queryKeys'
import {
  useWorkspaceParticipants,
  type WorkspaceParticipant,
} from '@/hooks/shared/useWorkspaceParticipants'
import { WazzupSection } from './WazzupSection'
import { LeadTemplateSetting } from './LeadTemplateSetting'
import { EmailSection } from './EmailSection'
import { BotTokenDialog } from './IntegrationsTab/BotTokenDialog'
import { EmployeeBotsSection } from './IntegrationsTab/EmployeeBotsSection'
import { GmailSection } from './IntegrationsTab/GmailSection'
import { GoogleCalendarSection } from './IntegrationsTab/GoogleCalendarSection'
import { PersonalTelegramSection } from './IntegrationsTab/PersonalTelegramSection'
import { TelegramSecretarySection } from './IntegrationsTab/TelegramSecretarySection'
import {
  IntegrationOverview,
  OVERVIEW_TELEGRAM_SECRETARY,
  OVERVIEW_TELEGRAM_EMPLOYEE_BOT,
  OVERVIEW_GMAIL,
  OVERVIEW_TELEGRAM_BUSINESS,
  OVERVIEW_TELEGRAM_MTPROTO,
  OVERVIEW_WAZZUP,
  OVERVIEW_EMAIL_RESEND,
} from './IntegrationsTab/IntegrationOverview'
import {
  TEAM_ROLES,
  type BotIntegration,
  type DialogState,
  type EmailAccount,
  type SectionKey,
} from './IntegrationsTab/types'

export function IntegrationsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [section, setSection] = useState<SectionKey>('telegram')

  const { data: integrations = [] } = useQuery({
    queryKey: integrationsKeys.workspace(workspaceId),
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
    queryKey: integrationsKeys.telegramGroups(workspaceId),
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
    queryKey: integrationsKeys.gmailAccounts(workspaceId),
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
  const employees = useMemo<WorkspaceParticipant[]>(
    () =>
      participants.filter((p) => {
        if (!p.user_id) return false
        const roles = p.workspace_roles ?? []
        return roles.some((r) => TEAM_ROLES.has(r))
      }),
    [participants],
  )

  const refreshIntegrations = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: integrationsKeys.workspace(workspaceId),
      }),
    [queryClient, workspaceId],
  )

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
    { id: 'wazzup', label: 'WhatsApp (Wazzup)', icon: MessageSquare },
    { id: 'email', label: 'Email (Resend)', icon: Mail },
    { id: 'google_calendar', label: 'Google Calendar', icon: CalendarIcon },
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
            <IntegrationOverview {...OVERVIEW_TELEGRAM_SECRETARY} />
            <TelegramSecretarySection
              workspaceBots={workspaceBots}
              telegramGroups={telegramGroups}
              onEdit={(bot) =>
                setDialog({ title: 'Токен бота-секретаря', bot, createParams: null })
              }
            />
            <IntegrationOverview {...OVERVIEW_TELEGRAM_EMPLOYEE_BOT} />
            <EmployeeBotsSection
              employees={employees}
              employeeBots={employeeBots}
              employeeBotByUserId={employeeBotByUserId}
              workspaceId={workspaceId!}
              onAction={setDialog}
            />
            <LeadTemplateSetting workspaceId={workspaceId!} source="telegram" />
          </>
        )}
        {section === 'gmail' && (
          <>
            <IntegrationOverview {...OVERVIEW_GMAIL} />
            <GmailSection emailAccounts={emailAccounts} participants={participants} />
            <LeadTemplateSetting workspaceId={workspaceId!} source="email" />
          </>
        )}
        {section === 'business' && (
          <>
            <IntegrationOverview {...OVERVIEW_TELEGRAM_BUSINESS} />
            <IntegrationOverview {...OVERVIEW_TELEGRAM_MTPROTO} />
            <PersonalTelegramSection workspaceId={workspaceId!} employees={employees} />
            <LeadTemplateSetting workspaceId={workspaceId!} source="telegram_business" />
            <LeadTemplateSetting workspaceId={workspaceId!} source="telegram_mtproto" />
          </>
        )}
        {section === 'wazzup' && (
          <>
            <IntegrationOverview {...OVERVIEW_WAZZUP} />
            <WazzupSection workspaceId={workspaceId!} employees={employees} />
            <LeadTemplateSetting workspaceId={workspaceId!} source="wazzup" />
          </>
        )}
        {section === 'email' && (
          <>
            <IntegrationOverview {...OVERVIEW_EMAIL_RESEND} />
            <EmailSection workspaceId={workspaceId!} />
          </>
        )}
        {section === 'google_calendar' && (
          <GoogleCalendarSection />
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
