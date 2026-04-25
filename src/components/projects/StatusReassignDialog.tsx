"use client"

/**
 * Диалог реассайна проектов при удалении project-статуса.
 *
 * Открывается, когда пользователь хочет удалить статус, который сейчас
 * используется проектами. Показывает счётчик и селектор «куда перевести».
 * После подтверждения пробрасывает выбранный `replacementStatusId` обратно
 * в вызывающий код — он сам выполняет UPDATE projects + DELETE status.
 */

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Database } from '@/types/database'

type Status = Database['public']['Tables']['statuses']['Row']

interface StatusReassignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Статус, который удаляют. */
  statusToDelete: Status | null
  /** Сколько проектов сейчас в этом статусе. Если 0 — диалог не должен открываться вовсе. */
  affectedProjectsCount: number
  /** Кандидаты на замену (тот же шаблон / общие воркспейсные). Без удаляемого. */
  candidates: Status[]
  /** Подтвердил пользователь. Передаём id замены или null если он выбрал «без статуса». */
  onConfirm: (replacementStatusId: string | null) => void
  isPending?: boolean
}

export function StatusReassignDialog({
  open,
  onOpenChange,
  statusToDelete,
  affectedProjectsCount,
  candidates,
  onConfirm,
  isPending,
}: StatusReassignDialogProps) {
  const [replacementId, setReplacementId] = useState<string>('__none__')

  const filtered = useMemo(
    () => candidates.filter((c) => c.id !== statusToDelete?.id),
    [candidates, statusToDelete?.id],
  )

  if (!statusToDelete) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить статус «{statusToDelete.name}»?</DialogTitle>
          <DialogDescription>
            Сейчас в этом статусе{' '}
            <span className="font-medium text-foreground">{affectedProjectsCount}</span>{' '}
            проект(ов). Выберите, в какой статус их перевести перед удалением.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select value={replacementId} onValueChange={setReplacementId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Без статуса" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Без статуса</SelectItem>
              {filtered.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(replacementId === '__none__' ? null : replacementId)}
            disabled={isPending}
          >
            {isPending ? 'Удаление…' : 'Перенести и удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
