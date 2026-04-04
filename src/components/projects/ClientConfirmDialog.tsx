"use client"

/**
 * Диалог подтверждения добавления клиента в нон-клиентскую роль
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ClientConfirmDialogProps {
  open: boolean
  roleName: string
  clientNames: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function ClientConfirmDialog({
  open,
  roleName,
  clientNames,
  onConfirm,
  onCancel,
}: ClientConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить клиента в роль «{roleName}»?</DialogTitle>
          <DialogDescription>
            {clientNames.length === 1 ? (
              <>
                Участник <strong>{clientNames[0]}</strong> имеет роль «Клиент» в рабочем
                пространстве. Вы уверены, что хотите добавить его в роль «{roleName}» в этом
                проекте?
              </>
            ) : (
              <>
                Следующие участники имеют роль «Клиент» в рабочем пространстве:{' '}
                <strong>{clientNames.join(', ')}</strong>. Вы уверены, что хотите добавить их в роль
                «{roleName}» в этом проекте?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={onConfirm}>Добавить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
