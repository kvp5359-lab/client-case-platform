"use client"

/**
 * Пикер слотов документов (множественный выбор) для добавления в план.
 * Используется внутри QuickAddModal (тип «Документ»).
 */

import { useState } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

export type SlotOption = { id: string; name: string }

export function SlotPicker({
  open,
  onClose,
  slots,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  slots: SlotOption[]
  onAdd: (slots: SlotOption[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleAdd = (ids: string[]) => {
    const byId = new Map(slots.map((s) => [s.id, s]))
    onAdd(ids.map((id) => byId.get(id)!).filter(Boolean))
    setSelected(new Set())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setSelected(new Set())
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить документ в план</DialogTitle>
        </DialogHeader>
        {slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Все документы-ячейки уже в списке или их нет. Создайте слот на вкладке «Документы».
          </p>
        ) : (
          <>
            <div className="-mx-1 max-h-80 space-y-0.5 overflow-y-auto px-1">
              {slots.map((s) => (
                // role=button, а не <button>: внутри Checkbox (Radix) сам рендерит
                // <button> — вложенные кнопки невалидны и дают hydration error.
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(s.id)
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <Checkbox checked={selected.has(s.id)} className="pointer-events-none" />
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.name}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleAdd(slots.map((s) => s.id))}
              >
                <Plus className="mr-1 size-3.5" /> Все ({slots.length})
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => handleAdd([...selected])}
              >
                Добавить{selected.size > 0 ? ` (${selected.size})` : ''}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
