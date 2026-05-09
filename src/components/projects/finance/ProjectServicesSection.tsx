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
  type ProjectService,
  type ProjectServiceFormData,
} from '@/hooks/useProjectServices'
import { projectServiceKeys } from '@/hooks/queryKeys'
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

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectService | null>(null)

  const confirm = useConfirmDialog()

  const totalSum = useMemo(
    () => services.reduce((acc, s) => acc + Number(s.total ?? 0), 0),
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
                : `${services.length} позиций · итого ${fmt(totalSum)} EUR`}
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
                        onEdit={() => openEdit(s)}
                        onDelete={() => askDelete(s)}
                        isDeleting={deleteMutation.isPending}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-3 py-2 text-right font-medium" colSpan={4}>
                      Итого
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {fmt(totalSum)}
                    </td>
                    <td />
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
  onEdit,
  onDelete,
  isDeleting,
}: {
  service: ProjectService
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
      <td className="px-3 py-2">{service.name}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {Number(service.quantity).toLocaleString('ru-RU')}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(service.price))}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {fmt(Number(service.total ?? 0))}
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
