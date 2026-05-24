"use client"

/**
 * Диалог «Добавить статусы из справочника» в редакторе шаблона проекта.
 * Чекбокс-выбор из всех project-статусов воркспейса, кроме тех,
 * что уже подключены к этому шаблону.
 */

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Database } from '@/types/database'

type Status = Database['public']['Tables']['statuses']['Row']

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: Status[]
  selected: Set<string>
  onSelectedChange: (selected: Set<string>) => void
  onSubmit: () => void
  isPending: boolean
}

export function StatusLibraryDialog({
  open,
  onOpenChange,
  candidates,
  selected,
  onSelectedChange,
  onSubmit,
  isPending,
}: Props) {
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить статусы из справочника</DialogTitle>
          <DialogDescription>
            Отметьте статусы, которые нужно подключить к шаблону. Их можно потом
            переупорядочить и пометить дефолтными/финальными именно в этом шаблоне.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Все статусы воркспейса уже добавлены в этот шаблон.
            </p>
          ) : (
            <div className="space-y-1">
              {candidates.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                  />
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
              onSelectedChange(new Set())
            }}
            disabled={isPending}
          >
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={isPending || selected.size === 0}>
            {isPending ? 'Добавление…' : `Добавить (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
