/**
 * FinanceTaxRatesDirectory — справочник ставок налога воркспейса.
 * Используется в финансовом модуле: при добавлении услуги в проект
 * можно выбрать ставку из этого справочника.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import {
  useFinanceTaxRates,
  useCreateFinanceTaxRate,
  useUpdateFinanceTaxRate,
  useDeleteFinanceTaxRate,
  type FinanceTaxRate,
} from '@/hooks/finance/useFinanceTaxRates'
import { FinanceTaxRateFormDialog } from './FinanceTaxRateFormDialog'

const formatRate = (rate: number): string =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(rate)}%`

export function FinanceTaxRatesDirectory() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data, isLoading, error } = useFinanceTaxRates(workspaceId)
  const rates = useMemo(() => data ?? [], [data])

  const createMutation = useCreateFinanceTaxRate(workspaceId)
  const updateMutation = useUpdateFinanceTaxRate(workspaceId)
  const deleteMutation = useDeleteFinanceTaxRate(workspaceId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceTaxRate | null>(null)
  const confirm = useConfirmDialog()

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (rate: FinanceTaxRate) => {
    setEditing(rate)
    setDialogOpen(true)
  }

  const handleSave = (form: { name: string; rate: number; is_default: boolean }) => {
    if (!form.name.trim()) {
      toast.error('Введи название')
      return
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Ставка обновлена' : 'Ставка создана')
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

  const askDelete = async (rate: FinanceTaxRate) => {
    const ok = await confirm.confirm({
      title: 'Удалить ставку?',
      description: `«${rate.name}» исчезнет из справочника. Услуги, к которым она привязана, сохранят свой процент налога — пересчёта не будет.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(rate.id, {
      onSuccess: () => toast.success('Ставка удалена'),
      onError: (e) => toast.error('Не удалось удалить', { description: (e as Error).message }),
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700"
        >
          Не удалось загрузить ставки
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Налоги</CardTitle>
            <CardDescription>
              {isLoading ? '—' : `${rates.length} ставок`}. Накручиваются сверху на стоимость услуги.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || rates.length === 0 ? (
            <EmptyState loading={isLoading} emptyText="Ставок пока нет" />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Название</th>
                    <th className="text-right px-4 py-2 font-medium w-24">Ставка</th>
                    <th className="px-4 py-2 w-24" />
                    <th className="px-4 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          {r.is_default && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Check className="h-3 w-3" />
                              По умолчанию
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatRate(Number(r.rate))}
                      </td>
                      <td />
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            aria-label="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => askDelete(r)}
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

      <FinanceTaxRateFormDialog
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
