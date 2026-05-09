"use client"

/**
 * Раздел «Нераспознанные письма» — `/workspaces/[id]/inbox/unmatched`.
 *
 * Письма попадают сюда из webhook'а `/api/resend-webhook`, когда
 * адрес-получатель — `inbox@<slug>.clientcase.app`, но автоматически
 * найти соответствующий тред (по In-Reply-To / References / From)
 * не получилось.
 *
 * MVP: список писем, кнопка обновить. Действия (привязать к треду,
 * пометить как спам) — следующая итерация.
 */

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Mail, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useUnmatchedEmails, type UnmatchedEmail } from '@/hooks/useEmailInboundUnmatched'
import { useQueryClient } from '@tanstack/react-query'
import { emailInboundKeys } from '@/hooks/queryKeys'

const REASON_LABELS: Record<string, string> = {
  inbox_match_failed: 'Не нашли тред по In-Reply-To/References/From',
  unknown_local: 'Неизвестный адрес-получатель',
}

export default function InboxUnmatchedPage() {
  usePageTitle('Нераспознанные письма')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  useEffect(() => {
    closePanel()
  }, [closePanel])

  const queryClient = useQueryClient()
  const { isLoading: permsLoading, isOwner, can } = useWorkspacePermissions({
    workspaceId: workspaceId ?? '',
  })
  const allowed = isOwner || can('manage_workspace_settings')

  const { data: emails = [], isLoading, isFetching } = useUnmatchedEmails(workspaceId)

  if (permsLoading) {
    return (
      <WorkspaceLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </WorkspaceLayout>
    )
  }

  if (!allowed) {
    return (
      <WorkspaceLayout>
        <div className="p-6 text-sm text-muted-foreground">
          У тебя нет прав на просмотр нераспознанных писем.
        </div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Нераспознанные письма
            </h1>
            <p className="text-sm text-muted-foreground">
              Письма, пришедшие на `inbox@…`, для которых не удалось найти подходящий тред.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => {
              if (workspaceId) {
                queryClient.invalidateQueries({
                  queryKey: emailInboundKeys.byWorkspace(workspaceId),
                })
              }
            }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : emails.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Нераспознанных писем нет.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {emails.map((email) => (
              <UnmatchedEmailCard key={email.id} email={email} />
            ))}
          </div>
        )}
      </div>
    </WorkspaceLayout>
  )
}

function UnmatchedEmailCard({ email }: { email: UnmatchedEmail }) {
  const reasonLabel = REASON_LABELS[email.reason] ?? email.reason
  const isResolved = !!email.resolved_at
  return (
    <Card className={isResolved ? 'opacity-60' : ''}>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm font-medium">
          {email.subject || <span className="text-muted-foreground italic">без темы</span>}
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          От{' '}
          <span className="font-mono">{email.from_address}</span>
          {email.from_name && <> · {email.from_name}</>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">Куда:</span>
          <span className="font-mono">{email.original_to ?? email.to_addresses.join(', ')}</span>
          <span className="text-muted-foreground">Когда:</span>
          <span>{new Date(email.received_at).toLocaleString('ru-RU')}</span>
          <span className="text-muted-foreground">Причина:</span>
          <span>{reasonLabel}</span>
          {email.in_reply_to && (
            <>
              <span className="text-muted-foreground">In-Reply-To:</span>
              <span className="font-mono break-all">{email.in_reply_to}</span>
            </>
          )}
          {isResolved && (
            <>
              <span className="text-muted-foreground">Разрешено:</span>
              <span>{new Date(email.resolved_at!).toLocaleString('ru-RU')}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
