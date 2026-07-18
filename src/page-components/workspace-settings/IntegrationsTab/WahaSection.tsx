"use client"

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { Loader2, Phone, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { integrationsKeys } from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'

type WahaSessionRow = {
  id: string
  owner_user_id: string | null
  session_name: string
  phone: string | null
  status: string
}

const isWorking = (s?: string | null) => s === 'WORKING'

export function WahaSection({
  workspaceId,
  employees,
  selfOnly = false,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
  selfOnly?: boolean
}) {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const queryClient = useQueryClient()
  const [connectOpen, setConnectOpen] = useState(false)

  const visibleEmployees = selfOnly
    ? employees.filter((e) => e.user_id === currentUserId)
    : employees

  const { data: sessions = [] } = useQuery({
    queryKey: integrationsKeys.wahaSessions(workspaceId),
    queryFn: async (): Promise<WahaSessionRow[]> => {
      const { data, error } = await supabase
        .from('waha_sessions')
        .select('id, owner_user_id, session_name, phone, status')
        .eq('workspace_id', workspaceId)
      if (error) throw error
      return (data ?? []) as WahaSessionRow[]
    },
    enabled: !!workspaceId,
  })

  const sessionByUser = new Map<string, WahaSessionRow>()
  sessions.forEach((s) => { if (s.owner_user_id) sessionByUser.set(s.owner_user_id, s) })
  const activeCount = sessions.filter((s) => isWorking(s.status)).length

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('waha-sessions', {
        body: { op: 'logout', workspace_id: workspaceId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('WhatsApp отключён')
      queryClient.invalidateQueries({ queryKey: integrationsKeys.wahaSessions(workspaceId) })
    },
    onError: (err) => toast.error(getUserFacingErrorMessage(err, 'Не удалось отключить')),
  })

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
              <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-base">WhatsApp (WAHA)</CardTitle>
              <CardDescription className="mt-0.5">
                Подключение личного WhatsApp сотрудника по QR-коду. Личные чаты и группы
                синхронизируются в обе стороны. Отдельное приложение не требуется.
              </CardDescription>
            </div>
          </div>
          {!selfOnly && (
            <Badge variant="outline" className="text-xs">
              {activeCount > 0 ? `Активно: ${activeCount}` : 'Никто не подключён'}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {selfOnly ? 'Профиль сотрудника не найден.' : 'Нет сотрудников в воркспейсе.'}
            </p>
          ) : (
            visibleEmployees.map((emp) => {
              if (!emp.user_id) return null
              const fullName =
                [emp.name, emp.last_name].filter(Boolean).join(' ') || emp.email || '—'
              const session = sessionByUser.get(emp.user_id)
              const isMe = emp.user_id === currentUserId
              const active = isWorking(session?.status)

              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {emp.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emp.avatar_url} alt="" className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted" />
                    ) : (
                      <div className="h-7 w-7 rounded-full shrink-0 bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    )}
                    <span className="font-medium text-sm truncate">{fullName}</span>
                    {session?.phone && (
                      <span className="text-xs text-muted-foreground truncate">— +{session.phone}</span>
                    )}
                    {active && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
                        активна
                      </Badge>
                    )}
                    {session && !active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {session.status === 'SCAN_QR_CODE' ? 'ждёт QR' : 'отключена'}
                      </Badge>
                    )}
                    {!session && (
                      <span className="text-xs text-muted-foreground shrink-0">не подключено</span>
                    )}
                  </div>
                  {isMe && !active && (
                    <Button size="sm" variant="outline" onClick={() => setConnectOpen(true)}>
                      Подключить
                    </Button>
                  )}
                  {isMe && active && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => logoutMutation.mutate()}
                      disabled={logoutMutation.isPending}
                    >
                      Отключить
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <WahaConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        workspaceId={workspaceId}
        onConnected={() =>
          queryClient.invalidateQueries({ queryKey: integrationsKeys.wahaSessions(workspaceId) })
        }
      />
    </>
  )
}

function WahaConnectDialog({
  open, onOpenChange, workspaceId, onConnected,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  onConnected: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключение WhatsApp</DialogTitle>
          <DialogDescription>
            Отсканируй QR-код в приложении WhatsApp: Настройки → Связанные устройства →
            Привязка устройства.
          </DialogDescription>
        </DialogHeader>

        {/* Тело монтируется только при открытии → свежее состояние без сброса в эффекте */}
        {open && (
          <WahaConnectBody
            workspaceId={workspaceId}
            onConnected={onConnected}
            onClose={() => onOpenChange(false)}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WahaConnectBody({
  workspaceId, onConnected, onClose,
}: {
  workspaceId: string
  onConnected: () => void
  onClose: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('STARTING')
  const [error, setError] = useState<string | null>(null)

  const call = useCallback(async (op: string) => {
    const { data, error } = await supabase.functions.invoke('waha-sessions', {
      body: { op, workspace_id: workspaceId },
    })
    if (error) throw error
    return data as { status?: string; qr?: string; error?: string; ok?: boolean }
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null
    const stop = () => { if (interval) { clearInterval(interval); interval = null } }

    ;(async () => {
      try {
        await call('create')
        if (cancelled) return
        interval = setInterval(async () => {
          try {
            const st = await call('status')
            if (cancelled) return
            setStatus(st.status ?? 'UNKNOWN')
            if (st.status === 'WORKING') {
              stop(); setQr(null); onConnected()
              toast.success('WhatsApp подключён')
              setTimeout(() => onClose(), 900)
            } else if (st.status === 'SCAN_QR_CODE') {
              const q = await call('qr').catch(() => null)
              if (!cancelled && q?.qr) setQr(q.qr)
            }
          } catch { /* транзиентно, ждём следующий тик */ }
        }, 3000)
      } catch (e) {
        if (!cancelled) setError(getUserFacingErrorMessage(e, 'Не удалось создать сессию'))
      }
    })()

    return () => { cancelled = true; stop() }
  }, [call, onConnected, onClose])

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-4 min-h-[280px]">
      {error ? (
        <p className="text-sm text-destructive text-center">{error}</p>
      ) : status === 'WORKING' ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ Подключено!</p>
      ) : qr ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR" className="w-56 h-56 rounded-md border bg-white p-2" />
          <p className="text-[11px] text-muted-foreground text-center">
            Код обновляется автоматически. Отсканируй телефоном.
          </p>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Готовим QR-код…</p>
        </>
      )}
    </div>
  )
}
