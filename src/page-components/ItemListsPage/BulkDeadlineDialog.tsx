"use client"

/**
 * Диалог пакетной установки срока выделенным тредам. Выбор даты + «Установить»,
 * либо «Снять срок» (deadline = null).
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
import { DatePicker } from '@/components/ui/date-picker'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  count: number
  pending: boolean
  onConfirm: (deadline: string | null) => void
}

export function BulkDeadlineDialog({ open, onOpenChange, count, pending, onConfirm }: Props) {
  const [date, setDate] = useState<Date | undefined>(undefined)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setDate(undefined); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Установить срок</DialogTitle>
          <DialogDescription>Срок применится к {count} выделенным.</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <DatePicker date={date} onDateChange={setDate} />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onConfirm(null)}
            disabled={pending}
            title="Очистить срок у выделенных"
          >
            Снять срок
          </Button>
          <Button
            disabled={pending || !date}
            onClick={() => date && onConfirm(date.toISOString())}
          >
            {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Установить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
