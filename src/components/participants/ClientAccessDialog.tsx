"use client"

/**
 * ClientAccessDialog — окно управления доступом участника в личный кабинет.
 *
 * Открывается круглой кнопкой рядом со статусом доступа в карточке участника.
 * Показывает текущее состояние, выдаёт/сбрасывает пароль и сразу отображает
 * сгенерированный логин+пароль для копирования (пароль показывается один раз).
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Check, KeyRound, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useParticipantsMutations } from '@/hooks/permissions/useParticipantsMutations'
import { copyToClipboard } from '@/utils/clipboard'

type ClientAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  participantId: string | null
  workspaceId?: string
  email?: string | null
  /** Уже выдан ли доступ (есть auth-аккаунт). */
  hasAccess: boolean
  /** Колбэк после успешной выдачи — чтобы родитель обновил индикатор. */
  onGranted?: () => void
}

export function ClientAccessDialog({
  open,
  onOpenChange,
  participantId,
  workspaceId,
  email,
  hasAccess,
  onGranted,
}: ClientAccessDialogProps) {
  const { setPasswordMutation } = useParticipantsMutations(workspaceId)
  const [result, setResult] = useState<{ login: string; password: string } | null>(null)
  const [grantedNow, setGrantedNow] = useState(false)
  const [copied, setCopied] = useState(false)

  const granted = hasAccess || grantedNow

  const url =
    typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'

  const handleAction = async () => {
    if (!participantId || setPasswordMutation.isPending) return
    try {
      const r = await setPasswordMutation.mutateAsync(participantId)
      setResult(r)
      setGrantedNow(true)
      onGranted?.()
    } catch {
      // тост об ошибке показывает мутация
    }
  }

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      toast.success(`${label} скопировано`)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Не удалось скопировать')
    }
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setResult(null)
      setCopied(false)
    }
    onOpenChange(v)
  }

  const message = result ? `Вход: ${url}\nЛогин: ${result.login}\nПароль: ${result.password}` : ''

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Доступ в личный кабинет</DialogTitle>
          <DialogDescription>
            {granted
              ? 'Клиент входит по email и паролю. Можно сбросить пароль — старый перестанет работать.'
              : 'Выдайте пароль — клиент сможет входить по своему email и этому паролю.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {email && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Логин (email)</Label>
              <Input readOnly value={email} className="font-mono text-sm" />
            </div>
          )}

          {result ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Пароль</Label>
                <Input readOnly value={result.password} className="font-mono text-sm" />
              </div>
              <p className="text-xs text-muted-foreground">
                Пароль показывается один раз. Скопируйте и отправьте клиенту.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => copy(result.password, 'Пароль')}
                >
                  Скопировать пароль
                </Button>
                <Button className="flex-1" onClick={() => copy(message, 'Сообщение')}>
                  {copied ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Скопировать всё
                </Button>
              </div>
            </>
          ) : (
            <Button
              className="w-full"
              variant={granted ? 'outline' : 'default'}
              onClick={handleAction}
              disabled={setPasswordMutation.isPending || !participantId}
            >
              {granted ? (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Сбросить пароль
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Выдать доступ по паролю
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
