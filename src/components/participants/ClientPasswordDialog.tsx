"use client"

/**
 * ClientPasswordDialog — показ сгенерированного пароля менеджеру.
 *
 * Открывается после выдачи/сброса доступа клиенту. Пароль показывается ОДИН
 * раз (сервер хранит только хеш и повторно его не отдаёт). Менеджер копирует
 * готовый текст и отправляет клиенту.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { copyToClipboard } from '@/utils/clipboard'

type ClientPasswordDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  login: string | null
  password: string | null
  /** Ссылка на страницу входа (для текста сообщения клиенту). */
  loginUrl?: string
}

export function ClientPasswordDialog({
  open,
  onOpenChange,
  login,
  password,
  loginUrl,
}: ClientPasswordDialogProps) {
  const [copied, setCopied] = useState(false)

  if (!login || !password) return null

  const url =
    loginUrl ??
    (typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login')

  const message = `Вход: ${url}\nЛогин: ${login}\nПароль: ${password}`

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Доступ выдан</DialogTitle>
          <DialogDescription>
            Скопируйте данные и отправьте клиенту. Пароль показывается один раз —
            если потеряете, можно сбросить и сгенерировать новый.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Логин (email)</Label>
            <Input readOnly value={login} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Пароль</Label>
            <Input readOnly value={password} className="font-mono text-sm" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => copy(password, 'Пароль')}
          >
            Скопировать пароль
          </Button>
          <Button onClick={() => copy(message, 'Сообщение')}>
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Скопировать всё
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
