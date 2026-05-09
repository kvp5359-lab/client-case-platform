/**
 * ProjectServicesSection — таблица «Услуги проекта» на вкладке Финансы.
 * Поддерживает добавление, редактирование, удаление и DnD-сортировку.
 */

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import {
  useProjectServices,
  useCreateProjectService,
  useUpdateProjectService,
  useDeleteProjectService,
  useReorderProjectServices,
  usePatchProjectService,
  type ProjectService,
  type ProjectServiceFormData,
  type ProjectServicePatch,
} from '@/hooks/useProjectServices'
import { useFinanceTaxRates } from '@/hooks/useFinanceTaxRates'
import { projectServiceKeys } from '@/hooks/queryKeys'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineEditSelect } from '@/components/ui/inline-edit-select'
import { ProjectServiceFormDialog } from './ProjectServiceFormDialog'

const fmt = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  )

interface Props {
  projectId: string
  workspaceId: string
}

export function ProjectServicesSection({ projectId, workspaceId }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useProjectServices(projectId)
  const services = useMemo(() => data ?? [], [data])

  const createMutation = useCreateProjectService(projectId)
  const updateMutation = useUpdateProjectService(projectId)
  const deleteMutation = useDeleteProjectService(projectId)
  const reorderMutation = useReorderProjectServices(projectId)
  const patchMutation = usePatchProjectService(projectId)
  const { data: taxRates = [] } = useFinanceTaxRates(workspaceId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectService | null>(null)

  const confirm = useConfirmDialog()

  // Subtotal — без налога; tax — суммарный налог; total — с налогом.
  const totals = useMemo(() => {
    let subtotal = 0
    let tax = 0
    for (const s of services) {
      const sub = Number(s.total ?? 0)
      subtotal += sub
      const rate = s.tax_rate == null ? 0 : Number(s.tax_rate)
      tax += sub * (rate / 100)
    }
    return { subtotal, tax, total: subtotal + tax }
  }, [services])
  const hasAnyTax = useMemo(
    () => services.some((s) => s.tax_rate != null && Number(s.tax_rate) > 0),
    [services],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = services.findIndex((s) => s.id === active.id)
    const newIdx = services.findIndex((s) => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(services, oldIdx, newIdx)

    // Optimistic update
    queryClient.setQueryData(
      projectServiceKeys.list(projectId),
      reordered.map((s, i) => ({ ...s, sort_order: i })),
    )
    reorderMutation.mutate(reordered.map((s) => s.id))
  }

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (service: ProjectService) => {
    setEditing(service)
    setDialogOpen(true)
  }

  const handleSave = (form: ProjectServiceFormData) => {
    if (!form.name.trim()) {
      toast.error('Введи название услуги')
      return
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Услуга обновлена' : 'Услуга добавлена')
        setDialogOpen(false)
      },
      onError: (e: unknown) =>
        toast.error('Не удалось сохранить', { description: (e as Error).message }),
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, form }, handlers)
    } else {
      createMutation.mutate(form, handlers)
    }
  }

  const handlePatch = (id: string, patch: ProjectServicePatch) => {
    patchMutation.mutate(
      { id, patch },
      {
        onError: (e) =>
          toast.error('Не удалось сохранить', { description: (e as Error).message }),
      },
    )
  }

  const askDelete = async (service: ProjectService) => {
    const ok = await confirm.confirm({
      title: 'Удалить услугу?',
      description: `«${service.name}» будет удалена из проекта. Это не повлияет на справочник услуг.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(service.id, {
      onSuccess: () => toast.success('Услуга удалена'),
      onError: (e) => toast.error('Не удалось удалить', { description: (e as Error).message }),
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Услуги проекта</CardTitle>
          <CardDescription>
            {isLoading
              ? '—'
              : services.length === 0
                ? 'Пока нет услуг'
                : `${services.length} позиций · итого ${fmt(totals.total)} EUR`}
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Добавить
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading || services.length === 0 ? (
          <EmptyState loading={isLoading} emptyText="Добавь первую услугу, чтобы начать учёт" />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="w-8" />
                    <th className="text-left px-3 py-2 font-medium">Название</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Кол-во</th>
                    <th className="text-right px-3 py-2 font-medium w-32">Цена, EUR</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Налог</th>
                    <th className="text-right px-3 py-2 font-medium w-32">Сумма, EUR</th>
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <SortableContext
                  items={services.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {services.map((s) => (
                      <SortableServiceRow
                        key={s.id}
                        service={s}
                        taxOptions={taxRates.map((t) => ({
                          value: t.id,
                          label: t.name,
                          hint: `${Number(t.rate)}%`,
                        }))}
                        taxRateById={(id) => {
                          const t = taxRates.find((r) => r.id === id)
                          return t ? Number(t.rate) : null
                        }}
                        onPatch={(patch) => handlePatch(s.id, patch)}
                        onEdit={() => openEdit(s)}
                        onDelete={() => askDelete(s)}
                        isDeleting={deleteMutation.isPending}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-3 py-2" colSpan={7}>
                      <div className="flex items-center justify-end gap-4 text-sm tabular-nums">
                        {hasAnyTax && (
                          <>
                            <span className="text-gray-500">
                              Без налога:{' '}
                              <span className="text-gray-700">{fmt(totals.subtotal)}</span>
                            </span>
                            <span className="text-gray-500">
                              Налог:{' '}
                              <span className="text-gray-700">+{fmt(totals.tax)}</span>
                            </span>
                          </>
                        )}
                        <span className="font-medium">
                          Итого:{' '}
                          <span className="font-semibold">{fmt(totals.total)} EUR</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </DndContext>
          </div>
        )}
      </CardContent>

      <ProjectServiceFormDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        editing={editing}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        state={confirm.state}
        onConfirm={confirm.handleConfirm}
        onCancel={confirm.handleCancel}
      />
    </Card>
  )
}

function SortableServiceRow({
  service,
  taxOptions,
  taxRateById,
  onPatch,
  onEdit,
  onDelete,
  isDeleting,
}: {
  service: ProjectService
  taxOptions: { value: string; label: string; hint?: string }[]
  taxRateById: (id: string) => number | null
  onPatch: (patch: ProjectServicePatch) => void
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
  })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <tr ref={setNodeRef} style={style} className="border-t">
      <td className="px-2 py-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1 text-gray-400 hover:text-gray-600"
          aria-label="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-3 py-2">
        <InlineEditCell
          type="text"
          value={service.name}
          onCommit={(v) => {
            const trimmed = v.trim()
            if (!trimmed || trimmed === service.name) return
            onPatch({ name: trimmed })
          }}
          placeholder="Название"
        />
      </td>
      <td className="px-3 py-2">
        <InlineEditCell
          type="number"
          align="right"
          value={Number(service.quantity)}
          format={(v) => (typeof v === 'number' ? v.toLocaleString('ru-RU') : '—')}
          min={0.01}
          onCommit={(v) => {
            if (v <= 0) return
            onPatch({ quantity: v })
          }}
        />
      </td>
      <td className="px-3 py-2">
        <InlineEditCell
          type="number"
          align="right"
          value={Number(service.price)}
          format={(v) => (typeof v === 'number' ? fmt(v) : '—')}
          min={0}
          onCommit={(v) => {
            if (v < 0) return
            onPatch({ price: v })
          }}
        />
      </td>
      <td className="px-3 py-2 text-gray-600">
        <InlineEditSelect
          align="right"
          value={service.tax_rate_id}
          options={taxOptions}
          noneLabel="— Без налога —"
          searchPlaceholder="Поиск ставки"
          emptyText={
            service.tax_rate == null
              ? '—'
              : `${Number(service.tax_rate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`
          }
          onCommit={(id) => {
            const rate = id ? taxRateById(id) : null
            onPatch({ tax_rate_id: id, tax_rate: rate })
          }}
        />
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {(() => {
          const sub = Number(service.total ?? 0)
          const rate = service.tax_rate == null ? 0 : Number(service.tax_rate)
          return fmt(sub * (1 + rate / 100))
        })()}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Редактировать">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="Удалить"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}
