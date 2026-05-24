/**
 * FinanceServicesDirectory — справочник услуг (для финансового модуля).
 * Простая таблица: название + базовая цена. Используется и для услуг
 * проекта, и как «статья» для доходов/расходов.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import {
  useFinanceServices,
  useCreateFinanceService,
  useUpdateFinanceService,
  useDeleteFinanceService,
  type FinanceService,
} from '@/hooks/finance/useFinanceServices'
import { FinanceServiceFormDialog } from './FinanceServiceFormDialog'

const formatPrice = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  )

export function FinanceServicesDirectory() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading, error } = useFinanceServices(workspaceId)
  const services = useMemo(() => data ?? [], [data])

  const createMutation = useCreateFinanceService(workspaceId)
  const updateMutation = useUpdateFinanceService(workspaceId)
  const deleteMutation = useDeleteFinanceService(workspaceId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceService | null>(null)

  const confirm = useConfirmDialog()
  const askDelete = async (service: FinanceService) => {
    const ok = await confirm.confirm({
      title: 'Удалить услугу?',
      description: `«${service.name}» будет скрыта из справочника. Услуги, уже добавленные в проекты, останутся как есть.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(service.id, {
      onSuccess: () => toast.success('Услуга удалена'),
      onError: (e) => toast.error('Не удалось удалить', { description: (e as Error).message }),
    })
  }

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (service: FinanceService) => {
    setEditing(service)
    setDialogOpen(true)
  }

  const handleSave = (form: { name: string; base_price: number }) => {
    if (!form.name.trim()) {
      toast.error('Введите название услуги')
      return
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Услуга обновлена' : 'Услуга создана')
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

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700"
        >
          Не удалось загрузить услуги
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Услуги</CardTitle>
            <CardDescription>
              {isLoading ? '—' : `${services.length} услуг(и)`}. Используются в финансовом модуле
              проекта.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || services.length === 0 ? (
            <EmptyState loading={isLoading} emptyText="Пока нет услуг" />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Название</th>
                    <th className="text-right px-4 py-2 font-medium w-40">Базовая цена, EUR</th>
                    <th className="px-4 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <tr key={service.id} className="border-t">
                      <td className="px-4 py-2">{service.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatPrice(Number(service.base_price))}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(service)}
                            aria-label="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => askDelete(service)}
                            aria-label="Удалить"
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FinanceServiceFormDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        state={confirm.state}
        onConfirm={confirm.handleConfirm}
        onCancel={confirm.handleCancel}
      />
    </div>
  )
}
