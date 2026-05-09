"use client"

/**
 * EmailSection — секция в IntegrationsTab для активации и мониторинга
 * email-канала воркспейса (через Resend).
 *
 * При первой активации мутация provision-email-domain:
 *   1. Создаёт Sender Domain `<slug>.clientcase.app` в Resend
 *   2. Добавляет 4 DNS-записи в зону clientcase.app через CF API
 *   3. Запускает Resend verify
 *   4. Обновляет workspaces.email_* и создаёт workspace_email_settings
 *
 * Идемпотентна — повторный вызов используется как «Перепроверить».
 */

import { useMemo } from 'react'
import {
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  RefreshCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  useWorkspaceEmailStatus,
  useProvisionEmailDomain,
} from '@/hooks/useWorkspaceEmail'

interface Props {
  workspaceId: string
}

export function EmailSection({ workspaceId }: Props) {
  const { data: status, isLoading } = useWorkspaceEmailStatus(workspaceId)
  const provision = useProvisionEmailDomain(workspaceId)

  const inboxAddress = status?.inbox_address ?? (status?.slug ? `inbox@${status.slug}.clientcase.app` : null)

  const isFullyVerified = useMemo(() => {
    if (!status) return false
    return (
      status.email_active &&
      status.email_dkim_verified &&
      status.email_return_path_verified &&
      status.email_mx_verified
    )
  }, [status])

  const onActivate = async () => {
    try {
      const result = await provision.mutateAsync()
      if (result.workspace.email_active) {
        toast.success('Email активирован')
      } else {
        toast.message('Запросили верификацию у Resend', {
          description: 'Это может занять до пары минут. Жми «Перепроверить» через 30 секунд.',
        })
      }
    } catch (e) {
      toast.error('Не удалось активировать email', {
        description: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-5 w-5 text-rose-500" />
            Email через Resend
            {isFullyVerified ? (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 border-emerald-300/40">
                Активен
              </Badge>
            ) : status?.email_resend_domain_id ? (
              <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700 border-yellow-300/40">
                Верификация
              </Badge>
            ) : (
              <Badge variant="secondary">Не активирован</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Приём писем на <span className="font-mono">inbox@{status?.slug ?? '<slug>'}.clientcase.app</span>{' '}
            и t+&lt;id&gt;@ / p+&lt;id&gt;@. Отправка — через Resend от имени домена воркспейса.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.email_resend_domain_id && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Email пока не активирован. Жми «Активировать» — мы создадим Resend-домен,
              добавим 4 DNS-записи и проверим верификацию автоматически. Занимает 1-2 минуты.
            </div>
          )}

          {status?.email_resend_domain_id && (
            <VerificationGrid status={status} />
          )}

          {isFullyVerified && inboxAddress && (
            <div className="rounded-md bg-muted/50 p-3 space-y-2 text-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Адрес для пересылок
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-foreground">{inboxAddress}</span>
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
              <div className="text-xs text-muted-foreground">
                Сотрудники могут настроить forward со своего рабочего ящика на этот адрес —
                и письма клиентов будут попадать в треды воркспейса.
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!status?.email_resend_domain_id ? (
              <Button onClick={onActivate} disabled={provision.isPending}>
                {provision.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Активировать email
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={onActivate}
                disabled={provision.isPending}
              >
                {provision.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4 mr-2" />
                )}
                Перепроверить
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface GridProps {
  status: NonNullable<ReturnType<typeof useWorkspaceEmailStatus>['data']>
}

function VerificationGrid({ status }: GridProps) {
  const rows = [
    { label: 'DKIM (подпись)', ok: status.email_dkim_verified },
    { label: 'SPF + Return-Path', ok: status.email_return_path_verified },
    { label: 'MX (приём писем)', ok: status.email_mx_verified },
    { label: 'Email активирован', ok: status.email_active },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          {r.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
          )}
          <span className={r.ok ? 'text-foreground' : 'text-muted-foreground'}>{r.label}</span>
        </div>
      ))}
    </div>
  )
}
