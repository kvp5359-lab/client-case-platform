"use client"

/**
 * GmailSection — секция интеграции с Gmail
 * Подключение/отключение Gmail аккаунтов для email-переписки в чатах
 */

import { memo } from 'react'
import { Link2, Unlink, Mail, AlertTriangle, Copy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useEmailAccounts } from '@/hooks/email/useEmailAccounts'
import { useConnectGmail } from '@/hooks/email/useConnectGmail'
import { useDisconnectGmail } from '@/hooks/email/useDisconnectGmail'
import { workspaceDomainKeys } from '@/hooks/queryKeys'

type GmailSectionProps = {
  workspaceId?: string | null
}

export const GmailSection = memo(function GmailSection({ workspaceId }: GmailSectionProps) {
  const { data: accounts = [], isLoading: accountsLoading } = useEmailAccounts()
  const { connect, loading: connectLoading } = useConnectGmail(workspaceId)
  const disconnectMutation = useDisconnectGmail()

  // workspace.slug нужен чтобы показать персональный inbox-адрес
  // вида inbox+<localpart>@<slug>.clientcase.app
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
  const loading = connectLoading || disconnectMutation.isPending || accountsLoading

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Email-интеграция</CardTitle>
        <CardDescription>
          Подключите Gmail для ведения email-переписки прямо внутри чатов проекта
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected accounts */}
        {accounts.map((account) => {
          const inactive = !account.is_active
          return (
            <div key={account.id} className="space-y-2">
              <div
                className={`flex items-center justify-between p-4 border rounded-lg ${inactive ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center">
                    <Mail className={`h-6 w-6 ${inactive ? 'text-amber-500' : 'text-red-500'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{account.email}</h3>
                    {inactive ? (
                      <span className="text-sm text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Требуется переподключение
                      </span>
                    ) : (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-green-600 rounded-full" />
                        Подключено
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => connect()}
                    disabled={loading}
                    className="gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    Переподключить
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate(account.id)}
                    disabled={loading}
                    className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Unlink className="h-4 w-4" />
                    Отключить
                  </Button>
                </div>
              </div>
              {inactive && (
                <p className="text-sm text-amber-700 px-4">
                  Доступ к Gmail отозван. Нажмите «Переподключить», чтобы восстановить отправку и получение писем.
                </p>
              )}
              {/* Персональный inbox-адрес для пересылки */}
              {!inactive && workspace?.slug && workspace.email_active && (
                <PersonalInboxBlock
                  workspaceSlug={workspace.slug}
                  accountEmail={account.email}
                />
              )}
            </div>
          )
        })}

        {/* Connect button (if no accounts) */}
        {!hasAccount && (
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center">
                <Mail className="h-6 w-6 text-gray-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Gmail</h3>
                <p className="text-sm text-gray-500">Не подключено</p>
              </div>
            </div>
            <Button size="sm" onClick={() => connect()} disabled={loading} className="gap-2">
              <Link2 className="h-4 w-4" />
              {connectLoading ? 'Подключение...' : 'Подключить'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

type PersonalInboxBlockProps = {
  workspaceSlug: string
  accountEmail: string
}

/**
 * Карточка с персональным inbox-адресом сотрудника. Показывается ниже
 * подключённого Gmail. Юзер копирует адрес → идёт в Gmail Settings →
 * Forwarding → вставляет → подтверждает код.
 */
function PersonalInboxBlock({ workspaceSlug, accountEmail }: PersonalInboxBlockProps) {
  const localPart = accountEmail.split('@')[0]?.toLowerCase() ?? 'me'
  const inboxAddress = `inbox+${localPart}@${workspaceSlug}.clientcase.app`
  return (
    <div className="mx-4 mb-2 rounded-md border border-rose-200 bg-rose-50/50 p-3">
      <div className="text-xs font-medium text-rose-900 uppercase tracking-wide mb-1">
        Твой адрес для пересылки в ClientCase
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-sm text-foreground">{inboxAddress}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => {
            navigator.clipboard.writeText(inboxAddress)
            toast.success('Скопировано')
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Настрой пересылку в Gmail на этот адрес: <strong>Settings → Forwarding and POP/IMAP →
        Add forwarding address</strong>. Все письма с твоего {accountEmail} будут автоматически
        попадать в треды ClientCase, а ответы клиентов — продолжать переписку в том же треде.
      </p>
    </div>
  )
}
