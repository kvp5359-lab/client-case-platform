"use client"

/**
 * SelectWorkspacePage — портальная страница выбора воркспейса.
 * Доступна на my.clientcase.app/select-workspace.
 *
 * Логика:
 * 1. Загружаем воркспейсы пользователя.
 * 2. Если ровно один — auto-redirect на его поддомен.
 * 3. Если несколько — показываем список с кнопками.
 * 4. Если ноль — предлагаем создать.
 *
 * После клика по воркспейсу — full reload на <slug>.clientcase.app.
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Plus, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { workspaceKeys, STALE_TIME } from '@/hooks/queryKeys'

type WorkspaceLite = {
  id: string
  name: string
  slug: string | null
  custom_domain: string | null
}

const ROOT_DOMAIN = 'clientcase.app'

function buildWorkspaceUrl(slug: string | null, customDomain: string | null): string | null {
  if (slug) return `https://${slug}.${ROOT_DOMAIN}/`
  if (customDomain) return `https://${customDomain}/`
  return null
}

async function fetchUserWorkspaces(): Promise<WorkspaceLite[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, slug, custom_domain')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as WorkspaceLite[]
}

export function SelectWorkspacePage() {
  usePageTitle('Выбор рабочего пространства')
  const { user, loading: authLoading } = useAuth()
  const [autoRedirected, setAutoRedirected] = useState(false)

  const {
    data: workspaces = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: fetchUserWorkspaces,
    staleTime: STALE_TIME.LONG,
    enabled: !!user,
  })

  // Если ровно один воркспейс с slug или custom_domain — auto-redirect
  useEffect(() => {
    if (autoRedirected || isLoading || !workspaces.length) return
    if (workspaces.length === 1) {
      const ws = workspaces[0]
      const url = buildWorkspaceUrl(ws.slug, ws.custom_domain)
      if (url) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- guard от повторного редиректа до того, как window.location.href сменит страницу
        setAutoRedirected(true)
        window.location.href = url
      }
    }
  }, [workspaces, isLoading, autoRedirected])

  if (authLoading || (isLoading && !!user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Загрузка…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Alert>
          <AlertDescription>Необходимо войти в систему.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Выберите рабочее пространство</h1>
          <p className="text-muted-foreground">
            {user.email} — {workspaces.length} {workspaces.length === 1 ? 'пространство' : 'пространств'}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Не удалось загрузить рабочие пространства</AlertDescription>
          </Alert>
        )}

        {workspaces.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Пока нет рабочих пространств</h2>
              <p className="text-muted-foreground mb-6">
                Создайте первое рабочее пространство, чтобы начать работу.
              </p>
              <Button onClick={() => (window.location.href = '/create-workspace')}>
                <Plus className="h-4 w-4 mr-2" />
                Создать пространство
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {workspaces.map((ws) => {
              const url = buildWorkspaceUrl(ws.slug, ws.custom_domain)
              const displayUrl = ws.slug
                ? `${ws.slug}.${ROOT_DOMAIN}`
                : ws.custom_domain || '— нет адреса —'
              return (
                <Card
                  key={ws.id}
                  className={url ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''}
                  onClick={() => {
                    if (url) window.location.href = url
                  }}
                >
                  <CardHeader className="flex-row justify-between items-center space-y-0">
                    <div>
                      <CardTitle className="text-lg">{ws.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">{displayUrl}</CardDescription>
                    </div>
                    {url ? (
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <span className="text-xs text-muted-foreground">не настроено</span>
                    )}
                  </CardHeader>
                </Card>
              )
            })}

            <Card>
              <CardContent className="p-4 text-center">
                <Button variant="outline" onClick={() => (window.location.href = '/create-workspace')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Создать новое
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
