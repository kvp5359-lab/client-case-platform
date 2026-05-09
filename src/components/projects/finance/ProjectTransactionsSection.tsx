/**
 * ProjectTransactionsSection — таблица транзакций (доходы или расходы).
 * Единый компонент с пропом type — структура полей и логика идентичные.
 */

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useFinanceServices } from '@/hooks/useFinanceServices'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import {
  useProjectTransactions,
  useCreateProjectTransaction,
  useUpdateProjectTransaction,
  useDeleteProjectTransaction,
  type ProjectTransaction,
  type ProjectTransactionFormData,
  type TransactionType,
} from '@/hooks/useProjectTransactions'
import { ProjectTransactionFormDialog } from './ProjectTransactionFormDialog'

const fmt = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  )

const formatDate = (iso: string): string => {
  // dd.MM.yyyy без часовой зоны (date — это просто дата без времени)
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const TYPE_CONFIG: Record<
  TransactionType,
  { title: string; subjectLabel: string; emptyText: string; addLabel: string }
> = {
  income: {
    title: 'Доходы',
    subjectLabel: 'От кого',
    emptyText: 'Доходов пока нет',
    addLabel: 'Добавить доход',
  },
  expense: {
    title: 'Расходы',
    subjectLabel: 'Кому',
    emptyText: 'Расходов пока нет',
    addLabel: 'Добавить расход',
  },
}

interface Props {
  projectId: string
  workspaceId: string
  type: TransactionType
}

export function ProjectTransactionsSection({ projectId, workspaceId, type }: Props) {
  const config = TYPE_CONFIG[type]
  const { data, isLoading } = useProjectTransactions(projectId, type)
  const transactions = useMemo(() => data ?? [], [data])

  // Карты для быстрого отображения имён по id (Selects берут эти же данные).
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const { data: catalog = [] } = useFinanceServices(workspaceId)
  const participantMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants])
  const serviceMap = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog])

  const createMutation = useCreateProjectTransaction(projectId)
  const updateMutation = useUpdateProjectTransaction(projectId)
  const deleteMutation = useDeleteProjectTransaction(projectId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectTransaction | null>(null)

  const confirm = useConfirmDialog()

  const totalSum = useMemo(
    () => transactions.reduce((acc, t) => acc + Number(t.amount ?? 0), 0),
    [transactions],
  )

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (trx: ProjectTransaction) => {
    setEditing(trx)
    setDialogOpen(true)
  }

  const handleSave = (form: ProjectTransactionFormData) => {
    if (form.amount <= 0) {
      toast.error('Сумма должна быть больше нуля')
      return
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Сохранено' : 'Добавлено')
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

  const askDelete = async (trx: ProjectTransaction) => {
    const ok = await confirm.confirm({
      title: type === 'income' ? 'Удалить доход?' : 'Удалить расход?',
      description: `Запись на ${fmt(Number(trx.amount))} EUR от ${formatDate(trx.date)} будет удалена.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(trx.id, {
      onSuccess: () => toast.success('Удалено'),
      onError: (e) => toast.error('Не удалось удалить', { description: (e as Error).message }),
    })
  }

  const formatParticipant = (id: string | null): string => {
    if (!id) return '—'
    const p = participantMap.get(id)
    if (!p) return '—'
    return [p.name, p.last_name].filter(Boolean).join(' ') || p.name
  }
  const formatService = (id: string | null): string => {
    if (!id) return '—'
    return serviceMap.get(id)?.name ?? '—'
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">{config.title}</CardTitle>
          <CardDescription>
            {isLoading
              ? '—'
              : transactions.length === 0
                ? config.emptyText
                : `${transactions.length} операций · итого ${fmt(totalSum)} EUR`}
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {config.addLabel}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading || transactions.length === 0 ? (
          <EmptyState loading={isLoading} emptyText={config.emptyText} />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-28">Дата</th>
                  <th className="text-left px-3 py-2 font-medium">{config.subjectLabel}</th>
                  <th className="text-left px-3 py-2 font-medium">Статья</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Сумма, EUR</th>
                  <th className="text-left px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{formatDate(t.date)}</td>
                    <td className="px-3 py-2">{formatParticipant(t.participant_id)}</td>
                    <td className="px-3 py-2">{formatService(t.service_id)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {fmt(Number(t.amount))}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.comment ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(t)}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => askDelete(t)}
                          disabled={deleteMutation.isPending}
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-3 py-2 text-right font-medium" colSpan={3}>
                    Итого
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {fmt(totalSum)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      <ProjectTransactionFormDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        type={type}
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
