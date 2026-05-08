"use client"

/**
 * Диалог подтверждения «войти под пользователем».
 * Открывает владелец воркспейса из меню участника.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { useImpersonation } from '@/hooks/useImpersonation'

interface StartImpersonationDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  targetUserId: string
  targetName: string
}

export function StartImpersonationDialog({
  open,
  onOpenChange,
  workspaceId,
  targetUserId,
  targetName,
}: StartImpersonationDialogProps) {
  const { start } = useImpersonation()
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Войти под пользователем
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2 text-left">
            <span className="block">
              Вы войдёте как <span className="font-medium">{targetName}</span> и увидите
              сервис ровно так, как видит этот пользователь: его задачи, чаты, доступы.
            </span>
            <span className="block">
              Режим строго для просмотра — любые изменения отключены. Сессия живёт
              30 минут, выйти можно в любой момент по баннеру сверху.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button
            onClick={async () => {
              setBusy(true)
              await start({ workspaceId, targetUserId })
              setBusy(false)
              onOpenChange(false)
            }}
            disabled={busy}
          >
            {busy ? 'Вхожу...' : 'Войти'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
