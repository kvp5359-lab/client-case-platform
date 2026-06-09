"use client"

/**
 * GmailSection — строка интеграции Gmail в аккордеоне профиля.
 * Подключение/отключение Gmail-аккаунтов для email-переписки в чатах.
 */

import { memo } from 'react'
import { Link2, Unlink, Mail, AlertTriangle, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useEmailAccounts } from '@/hooks/email/useEmailAccounts'
import { useConnectGmail } from '@/hooks/email/useConnectGmail'
import { useDisconnectGmail } from '@/hooks/email/useDisconnectGmail'
import { workspaceDomainKeys } from '@/hooks/queryKeys'
import { IntegrationRow, type IntegrationTone } from './IntegrationRow'

type GmailSectionProps = {
  workspaceId?: string | null
}

export const GmailSection = memo(function GmailSection({ workspaceId }: GmailSectionProps) {
  const { data: accounts = [], isLoading: accountsLoading } = useEmailAccounts()
  const { connect, loading: connectLoading } = useConnectGmail(workspaceId)
  const disconnectMutation = useDisconnectGmail()

  const { data: workspace } = useQuery({
    queryKey: workspaceDomainKeys.activeSlug(workspaceId ?? ''),
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('slug, email_active')
        .eq('id', workspaceId!)
        .maybeSingle()
      return data ?? null
    },
  })

  const hasAccount = accounts.length > 0
  const hasInactive = accounts.some((a) => !a.is_active)
  const loading = connectLoading || disconnectMutation.isPending || accountsLoading

  const tone: IntegrationTone = !hasAccount ? 'off' : hasInactive ? 'warn' : 'ok'
  const statusLabel = !hasAccount
    ? 'Не подключено'
    : hasInactive
      ? 'Требуется переподключение'
      : accounts.length > 1
        ? `Подключено: ${accounts.length}`
        : 'Подключено'

  return (
    <IntegrationRow
      icon={<Mail className="h-5 w-5 text-red-500" />}
      title="Email (Gmail)"
      statusLabel={statusLabel}
      tone={tone}
      defaultOpen={hasInactive}
    >
      <div className="space-y-3">
        {accounts.map((account) => {
          const inactive = !account.is_active
          return (
            <div key={account.id} className="space-y-2">
              <div
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${inactive ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className={`h-4 w-4 shrink-0 ${inactive ? 'text-amber-500' : 'text-red-500'}`} />
                  <span className="text-sm font-medium truncate">{account.email}</span>
                  {inactive ? (
                    <span className="text-xs text-amber-600 flex items-center gap-1 shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                      переподключить
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 shrink-0">подключено</span>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => connect()} disabled={loading} className="gap-1 h-7 px-2">
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Переподключить</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate(account.id)}
                    disabled={loading}
                    className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {inactive && (
                <p className="text-xs text-amber-700">
                  Доступ к Gmail отозван. Нажмите «Переподключить», чтобы восстановить отправку и
                  получение писем.
                </p>
              )}
              {!inactive && workspace?.slug && workspace.email_active && (
                <PersonalInboxBlock workspaceSlug={workspace.slug} accountEmail={account.email} />
              )}
            </div>
          )
        })}

        {!hasAccount && (
          <Button size="sm" onClick={() => connect()} disabled={loading} className="gap-2">
            <Link2 className="h-4 w-4" />
            {connectLoading ? 'Подключение...' : 'Подключить Gmail'}
          </Button>
        )}
      </div>
    </IntegrationRow>
  )
})

type PersonalInboxBlockProps = {
  workspaceSlug: string
  accountEmail: string
}

function PersonalInboxBlock({ workspaceSlug, accountEmail }: PersonalInboxBlockProps) {
  const localPart = accountEmail.split('@')[0]?.toLowerCase() ?? 'me'
  const inboxAddress = `inbox+${localPart}@${workspaceSlug}.clientcase.app`
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/50 p-3">
      <div className="text-xs font-medium text-rose-900 uppercase tracking-wide mb-1">
        Твой адрес для пересылки в ClientCase
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-sm text-foreground break-all">{inboxAddress}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(inboxAddress)
            toast.success('Скопировано')
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Настрой пересылку в Gmail на этот адрес: <strong>Settings → Forwarding and POP/IMAP → Add
        forwarding address</strong>. Все письма с твоего {accountEmail} будут автоматически попадать
        в треды ClientCase, а ответы клиентов — продолжать переписку в том же треде.
      </p>
    </div>
  )
}
