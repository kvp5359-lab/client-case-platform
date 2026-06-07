'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCurrentStatuses } from '@/lib/residence/useResidenceCatalog'
import { useCurrentStatusMutations } from '@/lib/residence/mutations'

/** Редактор справочника «Текущий статус» (значения ведутся вручную). */
export function CurrentStatusesDialog({
  open, onOpenChange, countryId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
}) {
  const q = useCurrentStatuses(countryId)
  const { create, rename, remove } = useCurrentStatusMutations(countryId)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const busy = create.isPending || rename.isPending || remove.isPending

  const handleAdd = async () => {
    if (!newName.trim()) return
    await create.mutateAsync(newName.trim())
    setNewName('')
  }
  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    await rename.mutateAsync({ id, name_ru: editName.trim() })
    setEditId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Справочник «Текущий статус»</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Значения, из которых выбираешь допустимые статусы у ВНЖ.
          </p>
        </DialogHeader>

        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {(q.data ?? []).length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">Пока нет статусов — добавь ниже.</p>
              )}
              {(q.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
                  {editId === s.id ? (
                    <>
                      <Input className="h-8 flex-1" value={editName} autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s.id) }} />
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy}
                        onClick={() => handleRename(s.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                        onClick={() => setEditId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{s.name_ru}</span>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                        onClick={() => { setEditId(s.id); setEditName(s.name_ru) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        disabled={busy} onClick={() => remove.mutate(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t pt-3">
              <Input value={newName} placeholder="Новый статус, напр. «Нет статуса»"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }} />
              <Button onClick={handleAdd} disabled={busy || !newName.trim()}>
                <Plus className="mr-1 h-4 w-4" /> Добавить
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
