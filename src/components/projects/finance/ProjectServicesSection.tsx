/**
 * ProjectServicesSection — «Услуги проекта» на вкладке Финансы.
 * Список строк-«квитанций» (название + сумма, детали второй строкой) —
 * формат без минимальной ширины, работает в узкой колонке и на телефоне.
 * Поддерживает добавление, инлайн-редактирование, удаление и DnD-сортировку.
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
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
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
} from '@/hooks/projects/useProjectServices'
import { useFinanceTaxRates } from '@/hooks/finance/useFinanceTaxRates'
import {
  useFinanceServices,
  useCreateFinanceService,
} from '@/hooks/finance/useFinanceServices'
import { projectServiceKeys } from '@/hooks/queryKeys'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineEditSelect } from '@/components/ui/inline-edit-select'
import { ProjectServiceFormDialog } from './ProjectServiceFormDialog'

const fmt = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  )

type Props = {
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

  // Справочник услуг воркспейса — название в строке выбирается из него
  // (как в форме: выбрал → подтянулись имя и цена). Переименование snapshot'а
  // под конкретный проект — через диалог (карандаш).
  const { data: catalog = [] } = useFinanceServices(workspaceId)
  const createCatalogItem = useCreateFinanceService(workspaceId)
  const serviceOptions = useMemo(
    () =>
      catalog.map((s) => ({
        value: s.id,
        label: s.name,
        hint: `${fmt(Number(s.base_price))} €`,
      })),
    [catalog],
  )

  // Выбор услуги из справочника: подменяем имя и цену на snapshot (то же
  // поведение, что в ProjectServiceFormDialog.handleSelectService).
  const handleSelectCatalogService = (rowId: string, catalogId: string) => {
    const item = catalog.find((c) => c.id === catalogId)
    if (!item) return
    handlePatch(rowId, {
      service_id: item.id,
      name: item.name,
      price: Number(item.base_price),
    })
  }

  // «+ Новая услуга» из селектора: создаём в справочнике (базовая цена —
  // текущая цена строки) и сразу привязываем к строке.
  const handleCreateCatalogService = async (
    row: ProjectService,
    name: string,
  ): Promise<string | null> => {
    try {
      const created = await createCatalogItem.mutateAsync({
        name,
        base_price: Number(row.price ?? 0),
      })
      // Патчим строку прямо здесь: локальный catalog в замыкании ещё старый,
      // handleSelectCatalogService созданную услугу не найдёт.
      handlePatch(row.id, { service_id: created.id, name: created.name })
      return created.id
    } catch (e) {
      toast.error('Не удалось создать услугу', { description: getUserFacingErrorMessage(e) })
      return null
    }
  }

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
        toast.error('Не удалось сохранить', { description: getUserFacingErrorMessage(e) }),
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
          toast.error('Не удалось сохранить', { description: getUserFacingErrorMessage(e) }),
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
      onError: (e) => toast.error('Не удалось удалить', { description: getUserFacingErrorMessage(e) }),
    })
  }

  return (
    <section className="group/section">
      <header className="flex items-center gap-3 mb-3">
        <h3 className="text-2xl font-semibold text-gray-900">Услуги проекта</h3>
        <Button
          size="sm"
          onClick={openCreate}
          className="md:opacity-0 md:group-hover/section:opacity-100 transition-opacity"
        >
          <Plus className="h-4 w-4 mr-1" />
          Добавить
        </Button>
      </header>
      <div>
        {isLoading || services.length === 0 ? (
          <EmptyState loading={isLoading} emptyText="Добавь первую услугу, чтобы начать учёт" />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {/* Формат «строка-квитанция» (как у Доходов/Расходов): название и
                сумма крупно, детали (кол-во × цена · налог) — мелкой второй
                строкой. Без минимальной ширины таблицы — живёт и в половине
                экрана, и на телефоне. DnD-сортировка сохранена. */}
            <div className="rounded-lg border divide-y overflow-hidden">
              <SortableContext
                items={services.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {services.map((s) => (
                  <SortableServiceRow
                    key={s.id}
                    service={s}
                    serviceOptions={serviceOptions}
                    onSelectService={(catalogId) => handleSelectCatalogService(s.id, catalogId)}
                    onCreateService={(name) => handleCreateCatalogService(s, name)}
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
              </SortableContext>
            </div>
            {/* Footer-теги — без боковых границ */}
            <div className="px-3 py-2 flex items-center justify-end gap-2 text-sm tabular-nums">
              {hasAnyTax && (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-600">
                    <span className="text-gray-500">Без налога:</span>
                    <span className="font-medium">{fmt(totals.subtotal)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-600">
                    <span className="text-gray-500">Налог:</span>
                    <span className="font-medium">+{fmt(totals.tax)}</span>
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900">
                <span>Итого:</span>
                <span className="font-semibold">{fmt(totals.total)} EUR</span>
              </span>
            </div>
          </DndContext>
        )}
      </div>

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
    </section>
  )
}

function SortableServiceRow({
  service,
  serviceOptions,
  onSelectService,
  onCreateService,
  taxOptions,
  taxRateById,
  onPatch,
  onEdit,
  onDelete,
  isDeleting,
}: {
  service: ProjectService
  serviceOptions: { value: string; label: string; hint?: string }[]
  onSelectService: (catalogId: string) => void
  onCreateService: (name: string) => Promise<string | null>
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
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1 pl-1.5 pr-3 py-2 group/row${isDragging ? ' bg-white' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-1 mt-0.5 text-gray-400 hover:text-gray-600"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {/* Название = выбор из справочника услуг (выбрал → подтянулись имя
                и цена), «+ Новая услуга» создаёт запись в справочнике.
                value=null намеренно: в ячейке всегда показан snapshot-name
                строки (его можно переименовать под проект через карандаш),
                а не имя из справочника. */}
            <InlineEditSelect
              value={null}
              options={serviceOptions}
              className="text-gray-900"
              emptyText={service.name || '—'}
              noneLabel={null}
              searchPlaceholder="Поиск услуги"
              popoverEmpty="В справочнике услуг пусто"
              onCommit={(id) => {
                if (id) onSelectService(id)
              }}
              onCreate={onCreateService}
              createLabel="Новая услуга"
            />
          </div>
          <div className="w-28 shrink-0 text-right text-sm font-medium tabular-nums py-1">
            {(() => {
              const sub = Number(service.total ?? 0)
              const rate = service.tax_rate == null ? 0 : Number(service.tax_rate)
              return `${fmt(sub * (1 + rate / 100))} €`
            })()}
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-gray-500">
          <div className="shrink-0 min-w-[1.5rem]">
            <InlineEditCell
              type="number"
              value={Number(service.quantity)}
              className="text-xs"
              format={(v) => (typeof v === 'number' ? v.toLocaleString('ru-RU') : '—')}
              min={0.01}
              onCommit={(v) => {
                if (v <= 0) return
                onPatch({ quantity: v })
              }}
            />
          </div>
          <span className="text-gray-300 select-none">×</span>
          <div className="shrink-0 min-w-[3rem]">
            <InlineEditCell
              type="number"
              value={Number(service.price)}
              className="text-xs"
              format={(v) => (typeof v === 'number' ? fmt(v) : '—')}
              min={0}
              onCommit={(v) => {
                if (v < 0) return
                onPatch({ price: v })
              }}
            />
          </div>
          {/* Пустой налог не шумит — проявляется при наведении на строку. */}
          <div
            className={`flex min-w-0 items-center gap-1.5 ${
              service.tax_rate_id != null || service.tax_rate != null
                ? ''
                : 'md:opacity-0 md:group-hover/row:opacity-100 transition-opacity'
            }`}
          >
          <span className="text-gray-300 select-none">·</span>
          <span className="text-gray-400 shrink-0 text-xs select-none">Налог:</span>
          <div className="min-w-0 max-w-[10rem]">
            <InlineEditSelect
              value={service.tax_rate_id}
              options={taxOptions}
              className="text-xs"
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
          </div>
          </div>
          {/* Действия — в конце строки деталей: не резервируют пустоту
              справа от суммы. На тач всегда видны. */}
          <div className="ml-auto flex items-center gap-0.5 shrink-0 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-400 hover:text-gray-900"
              onClick={onEdit}
              aria-label="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-400 hover:text-red-600 hover:bg-red-50"
              onClick={onDelete}
              disabled={isDeleting}
              aria-label="Удалить"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
