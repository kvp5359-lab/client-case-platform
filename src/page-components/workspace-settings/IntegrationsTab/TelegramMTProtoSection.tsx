"use client"

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, MessageCircle, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'

interface MTProtoSessionRow {
  user_id: string
  tg_user_id: number | null
  tg_username: string | null
  tg_first_name: string | null
  tg_last_name: string | null
  is_active: boolean
}

export function TelegramMTProtoSection({
  workspaceId,
  employees,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
}) {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const queryClient = useQueryClient()
  const [connectDialogOpen, setConnectDialogOpen] = useState(false)

  const { data: sessions = [] } = useQuery({
    queryKey: ['integrations', 'mtproto-sessions', workspaceId],
    queryFn: async (): Promise<MTProtoSessionRow[]> => {
      const { data, error } = await supabase
        .from('telegram_mtproto_sessions')
        .select('user_id, tg_user_id, tg_username, tg_first_name, tg_last_name, is_active')
        .eq('workspace_id', workspaceId)
      if (error) throw error
      return (data ?? []) as MTProtoSessionRow[]
    },
    enabled: !!workspaceId,
  })

  const sessionByUserId = useMemo(() => {
    const map = new Map<string, MTProtoSessionRow>()
    sessions.forEach((s) => map.set(s.user_id, s))
    return map
  }, [sessions])

  const activeCount = sessions.filter((s) => s.is_active).length

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'disconnect' },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Отключено')
      queryClient.invalidateQueries({
        queryKey: ['integrations', 'mtproto-sessions', workspaceId],
      })
    },
    onError: (err) => {
      toast.error('Не удалось отключить: ' + (err as Error).message)
    },
  })

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram MTProto</CardTitle>
              <CardDescription className="mt-0.5">
                Подключение личного Telegram-аккаунта по номеру телефона. Сообщения и
                реакции синхронизируются в обе стороны от имени сотрудника. Premium не
                требуется.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {activeCount > 0 ? `Активно: ${activeCount}` : 'Никто не подключён'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет сотрудников в воркспейсе.</p>
          ) : (
            employees.map((emp) => {
              if (!emp.user_id) return null
              const fullName =
                [emp.name, emp.last_name].filter(Boolean).join(' ') || emp.email || '—'
              const session = sessionByUserId.get(emp.user_id)
              const isMe = emp.user_id === currentUserId
              const tgName = session
                ? [session.tg_first_name, session.tg_last_name].filter(Boolean).join(' ') ||
                  session.tg_username ||
                  null
                : null

              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {emp.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={emp.avatar_url}
                        alt=""
                        className="h-7 w-7 rounded-full shrink-0 object-cover bg-muted"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full shrink-0 bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                    )}
                    <span className="font-medium text-sm truncate">{fullName}</span>
                    {tgName && (
                      <span className="text-xs text-muted-foreground truncate">
                        — {tgName}
                      </span>
                    )}
                    {session?.is_active && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 shrink-0 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
                      >
                        активна
                      </Badge>
                    )}
                    {session && !session.is_active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        отключена
                      </Badge>
                    )}
                    {!session && (
                      <span className="text-xs text-muted-foreground shrink-0">не подключено</span>
                    )}
                  </div>
                  {isMe && !session?.is_active && (
                    <Button size="sm" variant="outline" onClick={() => setConnectDialogOpen(true)}>
                      Подключить
                    </Button>
                  )}
                  {isMe && session?.is_active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
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

      <MTProtoConnectDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        workspaceId={workspaceId}
        onConnected={() =>
          queryClient.invalidateQueries({
            queryKey: ['integrations', 'mtproto-sessions', workspaceId],
          })
        }
      />
    </>
  )
}

type MTProtoStep = 'phone' | 'code' | 'password' | 'done'

export function MTProtoConnectDialog({
  open,
  onOpenChange,
  workspaceId,
  onConnected,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  onConnected: () => void
}) {
  const [step, setStep] = useState<MTProtoStep>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setStep('phone')
      setPhone('')
      setCode('')
      setPassword('')
      setBusy(false)
    }
  }, [open])

  const sendCode = async () => {
    if (!phone.trim()) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'send-code', workspace_id: workspaceId, phone: phone.trim() },
      })
      if (error || (data as { error?: string })?.error) {
        throw new Error(error?.message || (data as { error?: string }).error || 'Ошибка')
      }
      setStep('code')
      toast.success('Код отправлен в Telegram')
    } catch (err) {
      toast.error('Не удалось отправить код: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    if (!code.trim()) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'verify-code', code: code.trim() },
      })
      if (error) throw error
      const result = data as { signed_in?: boolean; requires_2fa?: boolean; error?: string }
      if (result?.error) throw new Error(result.error)
      if (result?.requires_2fa) {
        setStep('password')
        toast.info('Введите пароль 2FA')
      } else if (result?.signed_in) {
        setStep('done')
        toast.success('Telegram подключён')
        onConnected()
        setTimeout(() => onOpenChange(false), 800)
      } else {
        throw new Error('Неожиданный ответ сервера')
      }
    } catch (err) {
      toast.error('Ошибка: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const verifyPassword = async () => {
    if (!password) return
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: { op: 'verify-password', password },
      })
      if (error) throw error
      const result = data as { ok?: boolean; error?: string }
      if (result?.error) throw new Error(result.error)
      setStep('done')
      toast.success('Telegram подключён')
      onConnected()
      setTimeout(() => onOpenChange(false), 800)
    } catch (err) {
      toast.error('Неверный пароль: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключение Telegram</DialogTitle>
          <DialogDescription>
            Подключаем твой личный Telegram через MTProto. Сообщения и реакции пойдут от
            твоего имени, без бота-посредника.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {step === 'phone' && (
            <>
              <label className="text-sm font-medium">Номер телефона</label>
              <Input
                placeholder="+34643268407"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) sendCode()
                }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                В международном формате с «+». Telegram пришлёт код подтверждения сервисным
                сообщением от @Telegram.
              </p>
            </>
          )}
          {step === 'code' && (
            <>
              <label className="text-sm font-medium">Код из Telegram</label>
              <Input
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) verifyCode()
                }}
                autoFocus
                inputMode="numeric"
              />
              <p className="text-[11px] text-muted-foreground">
                Открой Telegram, найди чат «Telegram» и введи код оттуда.
              </p>
            </>
          )}
          {step === 'password' && (
            <>
              <label className="text-sm font-medium">Пароль 2FA</label>
              <Input
                type="password"
                placeholder="Пароль облачного хранилища"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) verifyPassword()
                }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                У этого аккаунта включена двухфакторная авторизация. Введи пароль, который
                ты ставил в Telegram.
              </p>
            </>
          )}
          {step === 'done' && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              ✓ Подключено. Сообщения начнут синхронизироваться сразу.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          {step === 'phone' && (
            <Button onClick={sendCode} disabled={busy || !phone.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Отправить код
            </Button>
          )}
          {step === 'code' && (
            <Button onClick={verifyCode} disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Подтвердить
            </Button>
          )}
          {step === 'password' && (
            <Button onClick={verifyPassword} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Войти
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
