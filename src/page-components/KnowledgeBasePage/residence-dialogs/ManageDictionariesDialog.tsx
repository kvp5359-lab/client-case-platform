'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCurrentStatuses } from '@/lib/residence/useResidenceCatalog'
import {
  useCurrentStatusMutations, useDeleteResidenceType, useDeleteCriterion,
} from '@/lib/residence/mutations'
import type { ResidenceCatalog, ResidenceCriterion, ResidenceType } from '@/lib/residence/types'
import { ResidenceTypeDialog } from './ResidenceTypeDialog'
import { CriterionDialog } from './CriterionDialog'

const CATEGORY_LABEL: Record<string, string> = {
  temporary: 'Временный', permanent: 'ПМЖ', citizenship: 'Гражданство',
}

/** Единое окно управления справочниками: виды ВНЖ, критерии, статусы. */
export function ManageDictionariesDialog({
  open, onOpenChange, countryId, catalog,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
  catalog: ResidenceCatalog
}) {
  const [tab, setTab] = useState('types')
  const [typeDialog, setTypeDialog] = useState<{ editing: ResidenceType | null } | null>(null)
  const [critDialog, setCritDialog] = useState<{ editing: ResidenceCriterion | null } | null>(null)
  const delType = useDeleteResidenceType(countryId)
  const delCrit = useDeleteCriterion(countryId)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-2xl [&>*]:min-w-0">
          <DialogHeader><DialogTitle>Справочники</DialogTitle></DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="types">Виды ВНЖ</TabsTrigger>
              <TabsTrigger value="criteria">Критерии</TabsTrigger>
              <TabsTrigger value="statuses">Статусы</TabsTrigger>
            </TabsList>

            {/* === Виды ВНЖ === */}
            <TabsContent value="types" className="mt-3">
              <div className="mb-2 flex justify-end">
                <Button size="sm" onClick={() => setTypeDialog({ editing: null })}>
                  <Plus className="mr-1 h-4 w-4" /> Вид ВНЖ
                </Button>
              </div>
              <div className="max-h-[55vh] space-y-1 overflow-y-auto">
                {catalog.residenceTypes.map((t) => (
                  <Row
                    key={t.id}
                    title={t.name_ru || t.name_en}
                    badge={CATEGORY_LABEL[t.category]}
                    onEdit={() => setTypeDialog({ editing: t })}
                    onDelete={() => delType.mutate(t.id)}
                  />
                ))}
              </div>
            </TabsContent>

            {/* === Критерии === */}
            <TabsContent value="criteria" className="mt-3">
              <div className="mb-2 flex justify-end">
                <Button size="sm" onClick={() => setCritDialog({ editing: null })}>
                  <Plus className="mr-1 h-4 w-4" /> Критерий
                </Button>
              </div>
              <div className="max-h-[55vh] space-y-2 overflow-y-auto">
                {catalog.groups.map((g) => {
                  const items = catalog.criteria.filter((c) => c.group_id === g.id)
                  if (!items.length) return null
                  return (
                    <div key={g.id}>
                      <div className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {g.name_ru || g.name_en}
                      </div>
                      {items.map((c) => (
                        <Row key={c.id} title={c.title_ru || c.title_en} badge={c.field_type}
                          onEdit={() => setCritDialog({ editing: c })}
                          onDelete={() => delCrit.mutate(c.id)} />
                      ))}
                    </div>
                  )
                })}
                {(() => {
                  const nogroup = catalog.criteria.filter(
                    (c) => !c.group_id || !catalog.groups.some((g) => g.id === c.group_id),
                  )
                  if (!nogroup.length) return null
                  return (
                    <div>
                      <div className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        Без группы
                      </div>
                      {nogroup.map((c) => (
                        <Row key={c.id} title={c.title_ru || c.title_en} badge={c.field_type}
                          onEdit={() => setCritDialog({ editing: c })}
                          onDelete={() => delCrit.mutate(c.id)} />
                      ))}
                    </div>
                  )
                })()}
              </div>
            </TabsContent>

            {/* === Статусы === */}
            <TabsContent value="statuses" className="mt-3">
              <StatusesTab countryId={countryId} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {typeDialog && (
        <ResidenceTypeDialog
          key={typeDialog.editing?.id ?? 'new'}
          open
          onOpenChange={(v) => { if (!v) setTypeDialog(null) }}
          countryId={countryId}
          residenceType={typeDialog.editing}
        />
      )}
      {critDialog && (
        <CriterionDialog
          key={critDialog.editing?.id ?? 'new'}
          open
          onOpenChange={(v) => { if (!v) setCritDialog(null) }}
          countryId={countryId}
          groups={catalog.groups}
          criterion={critDialog.editing}
        />
      )}
    </>
  )
}

function Row({
  title, badge, onEdit, onDelete,
}: {
  title: string
  badge?: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="group/row flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40">
      <span className="flex-1 truncate text-sm">{title}</span>
      {badge && <Badge variant="outline" className="shrink-0 text-[10px] font-normal">{badge}</Badge>}
      <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0 opacity-0 group-hover/row:opacity-100"
        onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground opacity-0 hover:text-destructive group-hover/row:opacity-100"
        onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function StatusesTab({ countryId }: { countryId: string }) {
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

  if (q.isLoading) return <Skeleton className="h-40 w-full" />

  return (
    <div className="space-y-3">
      <div className="max-h-[48vh] space-y-1 overflow-y-auto">
        {(q.data ?? []).length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">Пока нет статусов — добавь ниже.</p>
        )}
        {(q.data ?? []).map((s) => (
          <div key={s.id} className="group/row flex items-center gap-2 rounded px-2 py-0.5 hover:bg-muted/40">
            {editId === s.id ? (
              <>
                <Input className="h-8 flex-1" value={editName} autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s.id) }} />
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy}
                  onClick={() => handleRename(s.id)}><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                  onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm">{s.name_ru}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover/row:opacity-100"
                  onClick={() => { setEditId(s.id); setEditName(s.name_ru) }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground opacity-0 hover:text-destructive group-hover/row:opacity-100"
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
  )
}
