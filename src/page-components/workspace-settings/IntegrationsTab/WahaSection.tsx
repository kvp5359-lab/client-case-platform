"use client"

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { Loader2, Phone, Plus, QrCode, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { integrationsKeys } from '@/hooks/queryKeys'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'

type WahaSessionRow = {
  id: string
  owner_user_id: string | null
  session_name: string
  phone: string | null
  status: string
}

const isWorking = (s?: string | null) => s === 'WORKING'
const onlyDigits = (s: string) => s.replace(/\D/g, '')
const UNASSIGNED = '__none__'

export function WahaSection({
  workspaceId,
  employees,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
}) {
  const queryClient = useQueryClient()
  const [qrDialog, setQrDialog] = useState<{ sessionId: string } | null>(null)

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: integrationsKeys.wahaSessions(workspaceId) }),
    [queryClient, workspaceId],
  )

  const { data: sessions = [] } = useQuery({
    queryKey: integrationsKeys.wahaSessions(workspaceId),
    queryFn: async (): Promise<WahaSessionRow[]> => {
      const { data, error } = await supabase
        .from('waha_sessions')
        .select('id, owner_user_id, session_name, phone, status')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WahaSessionRow[]
    },
    enabled: !!workspaceId,
  })

  // Активные Wazzup-номера — предупреждаем о дублях (один номер в двух способах).
  const { data: wazzupPhones } = useQuery({
    queryKey: ['waha-wazzup-overlap', workspaceId],
    queryFn: async (): Promise<Set<string>> => {
      const { data } = await supabase
        .from('wazzup_channels').select('phone, state').eq('workspace_id', workspaceId)
      const set = new Set<string>()
      ;(data ?? []).forEach((c) => {
        if (c.phone && c.state === 'active') set.add(onlyDigits(c.phone as string))
      })
      return set
    },
    enabled: !!workspaceId,
  })

  const activeCount = sessions.filter((s) => isWorking(s.status)).length
  const accounts = employees.filter((e) => e.user_id)

  const invoke = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('waha-sessions', {
      body: { workspace_id: workspaceId, ...payload },
    })
    if (error) throw error
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
    return data as { session_id?: string }
  }, [workspaceId])

  const addMutation = useMutation({
    mutationFn: () => invoke({ op: 'create' }),
    onSuccess: (data) => {
      invalidate()
      if (data?.session_id) setQrDialog({ sessionId: data.session_id })
    },
    onError: (e) => toast.error(getUserFacingErrorMessage(e, 'Не удалось добавить номер')),
  })

  const assignMutation = useMutation({
    mutationFn: (v: { session_id: string; owner_user_id: string | null }) =>
      invoke({ op: 'assign', session_id: v.session_id, owner_user_id: v.owner_user_id }),
    onSuccess: invalidate,
    onError: (e) => toast.error(getUserFacingErrorMessage(e, 'Не удалось назначить ответственного')),
  })

  const deleteMutation = useMutation({
    mutationFn: (session_id: string) => invoke({ op: 'delete', session_id }),
    onSuccess: () => { invalidate(); toast.success('Номер удалён') },
    onError: (e) => toast.error(getUserFacingErrorMessage(e, 'Не удалось удалить')),
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
              <CardTitle className="text-base">Номера WhatsApp (свой сервер)</CardTitle>
              <CardDescription className="mt-0.5">
                Подключи номер по QR-коду и назначь ответственного. Ответственного можно
                менять в любой момент — переподключать номер не нужно.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {activeCount > 0 ? `Активно: ${activeCount}` : 'Нет номеров'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            size="sm" variant="outline" className="gap-1.5"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending}
          >
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Добавить номер
          </Button>

          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground pt-1">
              Пока нет подключённых номеров. Нажми «Добавить номер» и отсканируй QR.
            </p>
          ) : (
            sessions.map((s) => {
              const active = isWorking(s.status)
              const dupWazzup = !!(s.phone && wazzupPhones?.has(onlyDigits(s.phone)))
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-medium text-sm truncate">
                      {s.phone ? `+${s.phone}` : 'Новый номер'}
                    </span>
                    {active ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
                        активен
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {s.status === 'SCAN_QR_CODE' ? 'ждёт QR' : 'отключён'}
                      </Badge>
                    )}
                    {dupWazzup && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 shrink-0 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                        title="Этот номер уже подключён через Wazzup — будут дубли. Оставь один способ."
                      >
                        ⚠ также в Wazzup
                      </Badge>
                    )}
                  </div>

                  {/* Ответственный — как в Wazzup */}
                  <Select
                    value={s.owner_user_id ?? UNASSIGNED}
                    onValueChange={(v) =>
                      assignMutation.mutate({ session_id: s.id, owner_user_id: v === UNASSIGNED ? null : v })
                    }
                  >
                    <SelectTrigger className="w-44 h-8 text-sm shrink-0">
                      <SelectValue placeholder="Ответственный" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Не назначен</SelectItem>
                      {accounts.map((e) => (
                        <SelectItem key={e.user_id!} value={e.user_id!}>
                          {[e.name, e.last_name].filter(Boolean).join(' ') || e.email || '—'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8"
                      title={active ? 'Переподключить (новый QR)' : 'Подключить (QR)'}
                      onClick={() => setQrDialog({ sessionId: s.id })}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Удалить номер"
                      onClick={() => deleteMutation.mutate(s.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <WahaQrDialog
        open={!!qrDialog}
        sessionId={qrDialog?.sessionId ?? null}
        workspaceId={workspaceId}
        onOpenChange={(v) => { if (!v) setQrDialog(null) }}
        onConnected={invalidate}
      />
    </>
  )
}

function WahaQrDialog({
  open, sessionId, workspaceId, onOpenChange, onConnected,
}: {
  open: boolean
  sessionId: string | null
  workspaceId: string
  onOpenChange: (v: boolean) => void
  onConnected: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключение номера WhatsApp</DialogTitle>
          <DialogDescription>
            Отсканируй QR-код в приложении WhatsApp (телефон с этим номером): Настройки →
            Связанные устройства → Привязка устройства.
          </DialogDescription>
        </DialogHeader>
        {open && sessionId && (
          <WahaQrBody
            sessionId={sessionId}
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

function WahaQrBody({
  sessionId, workspaceId, onConnected, onClose,
}: {
  sessionId: string
  workspaceId: string
  onConnected: () => void
  onClose: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('STARTING')
  const [error, setError] = useState<string | null>(null)

  const call = useCallback(async (op: string) => {
    const { data, error } = await supabase.functions.invoke('waha-sessions', {
      body: { op, workspace_id: workspaceId, session_id: sessionId },
    })
    if (error) throw error
    return data as { status?: string; qr?: string; error?: string }
  }, [workspaceId, sessionId])

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null
    const stop = () => { if (interval) { clearInterval(interval); interval = null } }

    interval = setInterval(async () => {
      try {
        const st = await call('status')
        if (cancelled) return
        setStatus(st.status ?? 'UNKNOWN')
        if (st.status === 'WORKING') {
          stop(); setQr(null); onConnected()
          toast.success('Номер подключён')
          setTimeout(() => onClose(), 900)
        } else if (st.status === 'SCAN_QR_CODE') {
          const q = await call('qr').catch(() => null)
          if (!cancelled && q?.qr) setQr(q.qr)
        }
      } catch (e) {
        if (!cancelled) setError(getUserFacingErrorMessage(e, 'Ошибка получения QR'))
      }
    }, 3000)

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
