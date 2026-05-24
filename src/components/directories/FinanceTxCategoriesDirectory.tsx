/**
 * FinanceTxCategoriesDirectory — справочник статей доходов или расходов.
 * Один компонент, kind пробрасывается пропом.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import {
  useFinanceTxCategories,
  useCreateFinanceTxCategory,
  useUpdateFinanceTxCategory,
  useDeleteFinanceTxCategory,
  type FinanceTxCategory,
  type FinanceTxCategoryKind,
} from '@/hooks/finance/useFinanceTransactionCategories'

interface Props {
  kind: FinanceTxCategoryKind
}

const COPY: Record<FinanceTxCategoryKind, { title: string; description: string; empty: string }> = {
  income: {
    title: 'Статьи доходов',
    description: 'За что приходят деньги. Выбирается в строке дохода проекта.',
    empty: 'Статей доходов пока нет',
  },
  expense: {
    title: 'Статьи расходов',
    description: 'За что уходят деньги. Выбирается в строке расхода проекта.',
    empty: 'Статей расходов пока нет',
  },
}

export function FinanceTxCategoriesDirectory({ kind }: Props) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const copy = COPY[kind]
  const { data, isLoading } = useFinanceTxCategories(workspaceId, kind)
  const items = useMemo(() => data ?? [], [data])

  const createMutation = useCreateFinanceTxCategory(workspaceId, kind)
  const updateMutation = useUpdateFinanceTxCategory(workspaceId, kind)
  const deleteMutation = useDeleteFinanceTxCategory(workspaceId, kind)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FinanceTxCategory | null>(null)
  const confirm = useConfirmDialog()

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (cat: FinanceTxCategory) => {
    setEditing(cat)
    setDialogOpen(true)
  }

  const handleSave = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Введи название')
      return
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Статья обновлена' : 'Статья создана')
        setDialogOpen(false)
      },
      onError: (e: unknown) =>
        toast.error('Не удалось сохранить', { description: (e as Error).message }),
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, form: { name: trimmed } }, handlers)
    } else {
      createMutation.mutate({ name: trimmed }, handlers)
    }
  }

  const askDelete = async (cat: FinanceTxCategory) => {
    const ok = await confirm.confirm({
      title: 'Удалить статью?',
      description: `«${cat.name}» исчезнет из справочника. Транзакции, привязанные к ней, сохранят сумму, но потеряют ссылку на статью.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(cat.id, {
      onSuccess: () => toast.success('Статья удалена'),
      onError: (e) => toast.error('Не удалось удалить', { description: (e as Error).message }),
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">{copy.title}</CardTitle>
            <CardDescription>
              {isLoading ? '—' : `${items.length} статей`}. {copy.description}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || items.length === 0 ? (
            <EmptyState loading={isLoading} emptyText={copy.empty} />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Название</th>
                    <th className="px-4 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-4 py-2">{c.name}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-gray-900"
                            onClick={() => openEdit(c)}
                            aria-label="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => askDelete(c)}
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

      <CategoryFormDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
        kind={kind}
      />

      <ConfirmDialog
        state={confirm.state}
        onConfirm={confirm.handleConfirm}
        onCancel={confirm.handleCancel}
      />
    </div>
  )
}

function CategoryFormDialog({
  open,
  onOpenChange,
  editing,
  onSave,
  saving,
  kind,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FinanceTxCategory | null
  onSave: (name: string) => void
  saving: boolean
  kind: FinanceTxCategoryKind
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const title = editing
    ? 'Редактировать статью'
    : kind === 'income'
      ? 'Новая статья доходов'
      : 'Новая статья расходов'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="tx-category-name">Название</Label>
          <Input
            id="tx-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'income' ? 'Аванс / Полная оплата' : 'Госпошлина / Курьер'}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={() => onSave(name)} disabled={saving || !name.trim()}>
            {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
