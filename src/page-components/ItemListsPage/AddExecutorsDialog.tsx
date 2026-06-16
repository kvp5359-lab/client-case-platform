"use client"

/**
 * Диалог пакетного добавления исполнителей выделенным проектам.
 * Выбор участников через общий ParticipantsPicker, добавление — без confirm.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ParticipantsPicker, type PickerParticipant } from '@/components/participants/ParticipantsPicker'

type AddExecutorsDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  participants: PickerParticipant[]
  projectCount: number
  pending: boolean
  onConfirm: (participantIds: string[]) => void
  /** Заголовок диалога (по умолчанию «Добавить исполнителей»). */
  title?: string
  /** Текст-описание (по умолчанию — про роль «Исполнитель» в проектах). */
  description?: string
}

export function AddExecutorsDialog({
  open,
  onOpenChange,
  participants,
  projectCount,
  pending,
  onConfirm,
  title = 'Добавить исполнителей',
  description,
}: AddExecutorsDialogProps) {
  const [selected, setSelected] = useState<string[]>([])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected([])
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              `Роль «Исполнитель» будет добавлена выбранным участникам в ${projectCount} выделенных проектах.`}
          </DialogDescription>
        </DialogHeader>

        <ParticipantsPicker
          participants={participants}
          selectedIds={selected}
          onChange={setSelected}
          placeholder="Выбрать участников"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={() => onConfirm(selected)} disabled={pending || selected.length === 0}>
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
