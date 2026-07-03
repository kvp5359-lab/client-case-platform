"use client"

/**
 * Диалог отстранения конкретного исполнителя из выделенных проектов.
 * Список — объединение исполнителей всех выделенных проектов. Выбор одного,
 * затем confirm перед снятием.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { loadExecutorsOfProjects, type ExecutorOption } from './bulkExecutorActions'

type RemoveExecutorDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectIds: string[]
  pending: boolean
  onConfirm: (participantId: string) => void
}

export function RemoveExecutorDialog({
  open,
  onOpenChange,
  projectIds,
  pending,
  onConfirm,
}: RemoveExecutorDialogProps) {
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<ExecutorOption[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- запуск загрузки при открытии диалога */
    setLoading(true)
    setSelected(null)
    loadExecutorsOfProjects(projectIds)
      .then((opts) => {
        if (!cancelled) setOptions(opts)
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Не удалось загрузить исполнителей')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, projectIds])

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отстранить исполнителя</DialogTitle>
          <DialogDescription>
            Выберите исполнителя — он будет снят со всех выделенных проектов, где назначен.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              В выделенных проектах нет исполнителей.
            </p>
          ) : (
            <div className="space-y-1">
              {options.map((o) => (
                <button
                  key={o.participantId}
                  type="button"
                  onClick={() => setSelected(o.participantId)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors',
                    selected === o.participantId ? 'bg-brand-100' : 'hover:bg-muted/50',
                  )}
                >
                  <span>{o.name}</span>
                  <span className="text-xs text-muted-foreground">
                    в {o.projectCount} проектах
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !selected}
            onClick={async () => {
              if (!selected) return
              const name = options.find((o) => o.participantId === selected)?.name ?? ''
              const ok = await confirm({
                title: 'Отстранить исполнителя?',
                description: `«${name}» будет снят со всех выделенных проектов.`,
                variant: 'destructive',
              })
              if (!ok) return
              onConfirm(selected)
            }}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Отстранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
