"use client"

/**
 * DomainSettingsTab — настройки домена воркспейса (slug + custom_domain).
 *
 * Доступна только владельцу воркспейса.
 *
 * Slug: меняется один раз при создании воркспейса. Изменение ломает существующие
 * ссылки в почте/Telegram. Поэтому редактирование заблокировано после создания
 * (можно разрешить через техподдержку).
 *
 * Custom-домен: владелец вводит свой домен, добавляет CNAME в своём DNS,
 * жмёт «Проверить» — запускается фоновый job провижининга SSL.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Copy, Check, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { workspaceKeys, workspaceDomainKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

const ROOT_DOMAIN = 'clientcase.app'

type DomainStatus = 'pending' | 'dns_ok' | 'ssl_issued' | 'active' | 'failed' | null

type WorkspaceDomain = {
  id: string
  slug: string | null
  custom_domain: string | null
  custom_domain_status: DomainStatus
  custom_domain_verified_at: string | null
}

async function fetchWorkspaceDomain(workspaceId: string): Promise<WorkspaceDomain> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, slug, custom_domain, custom_domain_status, custom_domain_verified_at')
    .eq('id', workspaceId)
    .single()
  if (error) throw error
  return data as WorkspaceDomain
}

function formatStatus(status: DomainStatus): { text: string; variant: 'default' | 'secondary' | 'destructive' } {
  switch (status) {
    case 'active':
      return { text: 'Активно', variant: 'default' }
    case 'ssl_issued':
      return { text: 'SSL получен', variant: 'default' }
    case 'dns_ok':
      return { text: 'DNS настроен', variant: 'secondary' }
    case 'pending':
      return { text: 'Ожидаем настройку DNS', variant: 'secondary' }
    case 'failed':
      return { text: 'Ошибка', variant: 'destructive' }
    default:
      return { text: '—', variant: 'secondary' }
  }
}

export function DomainSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const { data: domain, isLoading, error } = useQuery({
    queryKey: workspaceDomainKeys.domain(workspaceId),
    queryFn: () => fetchWorkspaceDomain(workspaceId!),
    staleTime: STALE_TIME.LONG,
    enabled: !!workspaceId,
  })

  const [customDomainInput, setCustomDomainInput] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Сохранение custom_domain
  const saveCustomDomain = useMutation({
    mutationFn: async (newDomain: string | null) => {
      const { error } = await supabase
        .from('workspaces')
        .update({
          custom_domain: newDomain,
          custom_domain_status: newDomain ? 'pending' : null,
          custom_domain_verified_at: null,
        })
        .eq('id', workspaceId!)
      if (error) throw error

      // Запускаем провижининг SSL через Edge Function
      if (newDomain) {
        await supabase.functions.invoke('provision-domain', {
          body: { workspace_id: workspaceId, domain: newDomain, type: 'custom' },
        }).catch(() => {
          // Не критично если функция ещё не развёрнута — статус остаётся pending,
          // ручная проверка через кнопку «Проверить» сработает позже.
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceDomainKeys.domain(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
      toast.success('Домен сохранён')
      setCustomDomainInput('')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Ошибка сохранения'))
    },
  })

  // Перепроверить DNS + перезапустить провижининг
  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!domain?.custom_domain) return
      const res = await supabase.functions.invoke('provision-domain', {
        body: {
          workspace_id: workspaceId,
          domain: domain.custom_domain,
          type: 'custom',
          force: true,
        },
      })
      if (res.error) throw new Error(res.error.message ?? 'Ошибка проверки')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceDomainKeys.domain(workspaceId) })
      toast.success('Проверка запущена')
    },
    onError: (err: Error) => {
      toast.error(getUserFacingErrorMessage(err, 'Не удалось выполнить операцию'))
    },
  })

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  if (!workspaceId) return null

  const slugUrl = domain?.slug ? `${domain.slug}.${ROOT_DOMAIN}` : null
  const status = formatStatus(domain?.custom_domain_status ?? null)

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-6">

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          {/* Slug — основной адрес */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Основной адрес
              </CardTitle>
              <CardDescription>
                Адрес рабочего пространства на ClientCase. Меняется только через техподдержку —
                изменение ломает существующие ссылки в письмах и сообщениях.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={domain?.slug ?? '—'} readOnly className="font-mono" />
              </div>
              {slugUrl && (
                <div className="space-y-1.5">
                  <Label>URL</Label>
                  <div className="flex gap-2">
                    <Input value={`https://${slugUrl}`} readOnly className="font-mono" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(`https://${slugUrl}`, 'slug-url')}
                      title="Скопировать"
                    >
                      {copiedField === 'slug-url' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon" asChild title="Открыть">
                      <a href={`https://${slugUrl}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom-домен */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Свой домен
              </CardTitle>
              <CardDescription>
                Подключите свой домен (например, app.вашакомпания.com), чтобы клиенты заходили
                по нему вместо {ROOT_DOMAIN}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {domain?.custom_domain ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Подключённый домен</Label>
                      <Badge variant={status.variant}>{status.text}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Input value={domain.custom_domain} readOnly className="font-mono" />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(`https://${domain.custom_domain}`, 'custom-url')}
                        title="Скопировать URL"
                      >
                        {copiedField === 'custom-url' ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {domain.custom_domain_status !== 'active' && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="space-y-2">
                        <p className="font-medium">Настройте DNS у регистратора своего домена:</p>
                        <div className="bg-muted p-2 rounded font-mono text-xs">
                          {domain.custom_domain} CNAME {slugUrl ?? `your-slug.${ROOT_DOMAIN}`}
                        </div>
                        <p className="text-xs">
                          После того как DNS опубликуется (5-30 минут) — нажмите «Проверить».
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => verifyMutation.mutate()}
                      disabled={verifyMutation.isPending}
                    >
                      <RefreshCw
                        className={`h-4 w-4 mr-2 ${verifyMutation.isPending ? 'animate-spin' : ''}`}
                      />
                      Проверить
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Отключить свой домен?',
                          description: 'Клиенты больше не смогут заходить по нему.',
                          variant: 'destructive',
                        })
                        if (ok) {
                          saveCustomDomain.mutate(null)
                        }
                      }}
                      disabled={saveCustomDomain.isPending}
                    >
                      Отключить
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="custom-domain-input">Домен</Label>
                    <Input
                      id="custom-domain-input"
                      placeholder="app.example.com"
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value.toLowerCase().trim())}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Введите полное доменное имя без https:// и без слешей.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      if (!customDomainInput) return
                      // Базовая валидация FQDN
                      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(customDomainInput)) {
                        toast.error('Некорректное доменное имя')
                        return
                      }
                      if (customDomainInput.endsWith('.' + ROOT_DOMAIN)) {
                        toast.error(`Нельзя подключать поддомены ${ROOT_DOMAIN} как свой домен`)
                        return
                      }
                      saveCustomDomain.mutate(customDomainInput)
                    }}
                    disabled={!customDomainInput || saveCustomDomain.isPending}
                  >
                    Подключить
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
