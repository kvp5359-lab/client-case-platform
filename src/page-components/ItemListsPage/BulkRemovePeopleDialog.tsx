"use client"

/**
 * Диалог пакетного снятия людей (исполнителей или участников) из выделенных
 * тредов. Список — объединение по всем выделенным тредам (загружается через
 * `loader` при открытии). Мультивыбор + confirm перед снятием.
 */

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type { PeopleOption } from './bulkThreadActions'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  /** Загрузчик опций (вызывается при открытии). */
  loader: () => Promise<PeopleOption[]>
  pending: boolean
  onConfirm: (participantIds: string[]) => void
}

export function BulkRemovePeopleDialog({
  open,
  onOpenChange,
  title,
  description,
  loader,
  pending,
  onConfirm,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<PeopleOption[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setSelected(new Set())
    loader()
      .then((opts) => { if (!cancelled) setOptions(opts) })
      .catch((e) => { if (!cancelled) toast.error(e instanceof Error ? e.message : 'Не удалось загрузить список') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // Грузим один раз при открытии; loader пересоздаётся каждый рендер — в deps не кладём.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto -mx-2 px-2 py-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаю…
            </div>
          ) : options.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Никого нет</div>
          ) : (
            options.map((o) => {
              const isSel = selected.has(o.participantId)
              return (
                <button
                  key={o.participantId}
                  type="button"
                  onClick={() => toggle(o.participantId)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors',
                    isSel ? 'bg-primary/10' : 'hover:bg-muted/50',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                    isSel ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                  )}>
                    {isSel && <Check className="w-3 h-3" />}
                  </div>
                  <span className="text-sm truncate flex-1">{o.name}</span>
                  <span className="text-[11px] text-muted-foreground">×{o.count}</span>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Отмена</Button>
          <Button
            variant="destructive"
            disabled={pending || selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Снять ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
