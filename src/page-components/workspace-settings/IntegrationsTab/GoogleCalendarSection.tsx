"use client"

/**
 * GoogleCalendarSection — раздел «Google Calendar» в IntegrationsTab.
 *
 * Логика:
 * 1. Если у пользователя нет токена в google_calendar_tokens — показываем
 *    кнопку «Подключить Google Calendar» (открывает OAuth-попап).
 * 2. После подключения — список Google-календарей пользователя (через
 *    google-calendar-list). Чекбоксом можно добавить любой в нашу
 *    систему — создаётся запись в `calendars` и сразу триггерится sync.
 * 3. Внизу — список уже добавленных календарей с кнопкой «Удалить»
 *    и «Обновить вручную».
 */

import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon, RefreshCw, Trash2 } from 'lucide-react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useConnectGoogleCalendar,
  useCreateCalendar,
  useDeleteCalendar,
  useDisconnectGoogleCalendar,
  useGoogleCalendarToken,
  useRemoteGoogleCalendars,
  useSyncCalendar,
  useWorkspaceCalendars,
} from '@/hooks/useGoogleCalendar'

export function GoogleCalendarSection() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: token, isLoading: tokenLoading } = useGoogleCalendarToken()
  const isConnected = !!token
  const remoteCalendars = useRemoteGoogleCalendars(isConnected)
  const workspaceCalendars = useWorkspaceCalendars(workspaceId)
  const connect = useConnectGoogleCalendar()
  const disconnect = useDisconnectGoogleCalendar()
  const createCal = useCreateCalendar()
  const deleteCal = useDeleteCalendar()
  const syncCal = useSyncCalendar()
  const [busy, setBusy] = useState(false)

  // Какие Google-календари уже добавлены в нашу систему.
  const addedGoogleIds = useMemo(
    () =>
      new Set(
        (workspaceCalendars.data ?? [])
          .filter((c) => c.source === 'google')
          .map((c) => c.google_calendar_id),
      ),
    [workspaceCalendars.data],
  )

  const handleAdd = async (remoteCal: { id: string; name: string; color: string }) => {
    if (!workspaceId) return
    setBusy(true)
    try {
      await createCal.mutateAsync({
        workspace_id: workspaceId,
        name: remoteCal.name,
        color: remoteCal.color,
        source: 'google',
        google_calendar_id: remoteCal.id,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
            <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Google Calendar</CardTitle>
            <CardDescription className="mt-0.5">
              Подключите Google-аккаунт и выберите календари, которые будут видны
              в наших календарных списках.
            </CardDescription>
          </div>
        </div>
        {isConnected && (
          <Badge variant="outline" className="text-xs">
            {token?.google_email ?? 'Подключено'}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {tokenLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : !isConnected ? (
          <Button onClick={() => connect()} disabled={busy}>
            Подключить Google Calendar
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Доступные календари из Google
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Отключить
              </Button>
            </div>

            {remoteCalendars.isLoading && (
              <p className="text-sm text-muted-foreground">Загружаю список календарей…</p>
            )}

            {remoteCalendars.error && (
              <p className="text-sm text-destructive">
                Не удалось загрузить календари: {String(remoteCalendars.error)}
              </p>
            )}

            {(remoteCalendars.data ?? []).map((cal) => {
              const added = addedGoogleIds.has(cal.id)
              return (
                <div
                  key={cal.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cal.color }}
                    />
                    <span className="font-medium text-sm truncate">{cal.name}</span>
                    {cal.primary && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        primary
                      </Badge>
                    )}
                  </div>
                  {added ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      добавлен
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdd(cal)}
                      disabled={busy}
                    >
                      Добавить
                    </Button>
                  )}
                </div>
              )
            })}

            {(workspaceCalendars.data ?? []).filter((c) => c.source === 'google').length > 0 && (
              <div className="pt-3 mt-3 border-t space-y-2">
                <p className="text-sm font-medium">Календари в воркспейсе</p>
                {(workspaceCalendars.data ?? [])
                  .filter((c) => c.source === 'google')
                  .map((cal) => (
                    <div
                      key={cal.id}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cal.color }}
                        />
                        <span className="font-medium text-sm truncate">{cal.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Синхронизировать сейчас"
                          onClick={() => syncCal.mutate(cal.id)}
                          disabled={syncCal.isPending}
                          className="h-7 w-7"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Удалить календарь из воркспейса"
                          onClick={() => deleteCal.mutate(cal.id)}
                          disabled={deleteCal.isPending}
                          className="h-7 w-7 text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
